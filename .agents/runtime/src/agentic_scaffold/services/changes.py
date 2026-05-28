from __future__ import annotations

import hashlib
import os
import re
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agentic_scaffold.config import RuntimeConfig
from agentic_scaffold.models import ArchiveResult, ChangeRecord, FileWriteResult
from agentic_scaffold.process_utils import (
    DEFAULT_COMMAND_TIMEOUT_SECONDS,
    ProcessError,
    run_command,
)
from agentic_scaffold.services.journal import JournalStore


class UnsafePathError(ValueError):
    pass


_ARCHIVE_SLUG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


class ChangeService:
    def __init__(self, config: RuntimeConfig, journal: JournalStore) -> None:
        self.config = config
        self.journal = journal

    def _resolve_target(self, relative_path: str) -> Path:
        if not relative_path.strip():
            raise UnsafePathError("path is empty")
        path = (self.config.repo_root / relative_path).resolve()
        try:
            relative = path.relative_to(self.config.repo_root).as_posix()
        except ValueError as exc:
            raise UnsafePathError("path is outside the repository") from exc
        for blocked in self.config.write_blocklist:
            if relative == blocked or relative.startswith(f"{blocked}/"):
                raise UnsafePathError(f"path is blocked: {relative}")
        return path

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _file_meta(self, path: Path) -> dict[str, Any]:
        exists = path.exists()
        meta: dict[str, Any] = {
            "exists": exists,
            "is_dir": path.is_dir() if exists else False,
            "bytes": 0,
            "sha256": None,
        }
        if exists and path.is_file():
            meta["bytes"] = path.stat().st_size
            meta["sha256"] = self._sha256(path)
        return meta

    def _session_task_context(self) -> dict[str, str]:
        session_id = os.getenv("AGENTS_SESSION_ID", "").strip()
        task_id = os.getenv("AGENTS_TASK_ID", "").strip()
        active_session_file = self.config.repo_root / ".agents" / "wb" / ".active_session"
        if not session_id and active_session_file.exists():
            session_id = active_session_file.read_text(encoding="utf-8").strip()
        if not session_id:
            return {"session_id": "", "task_id": task_id}
        if task_id:
            return {"session_id": session_id, "task_id": task_id}
        session_dir = self.config.repo_root / ".agents" / "wb" / session_id
        task_files = sorted(session_dir.glob("*_task_*.md"))
        if not task_files:
            return {"session_id": session_id, "task_id": ""}
        for line in task_files[0].read_text(encoding="utf-8").splitlines():
            if not line.startswith("|"):
                continue
            cells = [part.strip() for part in line.strip().split("|")]
            if len(cells) < 4:
                continue
            if cells[1].startswith("T-") and cells[2] == "in_progress":
                return {"session_id": session_id, "task_id": cells[1]}
        return {"session_id": session_id, "task_id": ""}

    def _journal_payload(
        self,
        *,
        mutation_id: str,
        mutation_action: str,
        command: str,
        reason: str,
        target_paths: list[str],
        before: dict[str, Any],
        after: dict[str, Any],
        backup: dict[str, Any],
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "mutation_id": mutation_id,
            "mutation_action": mutation_action,
            "command": command,
            "reason": reason,
            "context": self._session_task_context(),
            "dry_run": False,
            "target_paths": target_paths,
            "before": before,
            "after": after,
            "backup": backup,
        }
        if extra:
            payload.update(extra)
        return payload

    def _dry_run_plan(
        self,
        *,
        mutation_id: str,
        mutation_action: str,
        command: str,
        reason: str,
        target_paths: list[str],
        before: dict[str, Any],
        after: dict[str, Any],
        backup: dict[str, Any],
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = self._journal_payload(
            mutation_id=mutation_id,
            mutation_action=mutation_action,
            command=command,
            reason=reason,
            target_paths=target_paths,
            before=before,
            after=after,
            backup=backup,
            extra=extra,
        )
        payload["dry_run"] = True
        return payload

    def write_text_file(self, relative_path: str, content: str, reason: str, dry_run: bool = False) -> FileWriteResult | dict[str, Any]:
        target = self._resolve_target(relative_path)
        existed_before = target.exists()
        before = self._file_meta(target)
        change_id = self.journal.next_change_id()
        command = f"write_text_file --path {relative_path}"
        backup_preview = self.journal.planned_backup_path(change_id, self.config.repo_root, target)
        if dry_run:
            return self._dry_run_plan(
                mutation_id=change_id,
                mutation_action="write_text",
                command=command,
                reason=reason,
                target_paths=[target.relative_to(self.config.repo_root).as_posix()],
                before={"target": before},
                after={"target": {"bytes": len(content.encode('utf-8')), "exists": True}},
                backup={"path": backup_preview if existed_before else "", "needed": existed_before},
            )
        backup_path = self.journal.backup_file(change_id, self.config.repo_root, target)

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        after = self._file_meta(target)

        record = ChangeRecord(
            change_id=change_id,
            action="write_text",
            target_paths=[target.relative_to(self.config.repo_root).as_posix()],
            reason=reason,
            created_at=datetime.now(timezone.utc),
        )
        payload = self._journal_payload(
            mutation_id=change_id,
            mutation_action="write_text",
            command=command,
            reason=reason,
            target_paths=[target.relative_to(self.config.repo_root).as_posix()],
            before={"target": before},
            after={"target": after},
            backup={"path": backup_path, "needed": existed_before},
            extra={
                "target_path": target.relative_to(self.config.repo_root).as_posix(),
                "backup_path": backup_path,
                "existed_before": existed_before,
            },
        )
        self.journal.record(record, payload)
        return FileWriteResult(
            change_id=change_id,
            path=target.relative_to(self.config.repo_root).as_posix(),
            bytes_written=len(content.encode("utf-8")),
            reason=reason,
        )

    def apply_unified_diff(
        self, relative_path: str, diff_text: str, reason: str, dry_run: bool = False
    ) -> FileWriteResult | dict[str, Any]:
        target = self._resolve_target(relative_path)
        if not target.exists():
            raise FileNotFoundError(relative_path)
        before = self._file_meta(target)
        change_id = self.journal.next_change_id()
        command = f"apply_unified_diff --path {relative_path}"
        backup_preview = self.journal.planned_backup_path(change_id, self.config.repo_root, target)
        if dry_run:
            return self._dry_run_plan(
                mutation_id=change_id,
                mutation_action="patch",
                command=command,
                reason=reason,
                target_paths=[target.relative_to(self.config.repo_root).as_posix()],
                before={"target": before},
                after={"target": {"exists": True}},
                backup={"path": backup_preview, "needed": True},
            )
        backup_path = self.journal.backup_file(change_id, self.config.repo_root, target)

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".diff", delete=False) as handle:
            handle.write(diff_text)
            temp_patch_path = Path(handle.name)
        try:
            completed = run_command(
                [
                    "patch",
                    "--silent",
                    "--strip=0",
                    str(target),
                    str(temp_patch_path),
                ],
                cwd=self.config.repo_root,
                check=False,
                capture_output=True,
                text=True,
                timeout=DEFAULT_COMMAND_TIMEOUT_SECONDS,
            )
        except ProcessError as exc:
            raise RuntimeError(f"Patch command failed to execute: {exc}") from exc
        finally:
            temp_patch_path.unlink(missing_ok=True)

        if completed.returncode != 0:
            # restore the backup defensively
            if backup_path:
                self.journal.restore_backup(
                    repo_root=self.config.repo_root,
                    backup_relative=backup_path,
                    target_relative=target.relative_to(self.config.repo_root).as_posix(),
                )
            raise RuntimeError((completed.stderr or completed.stdout or "failed to apply patch").strip())
        after = self._file_meta(target)

        record = ChangeRecord(
            change_id=change_id,
            action="patch",
            target_paths=[target.relative_to(self.config.repo_root).as_posix()],
            reason=reason,
            created_at=datetime.now(timezone.utc),
        )
        payload = self._journal_payload(
            mutation_id=change_id,
            mutation_action="patch",
            command=command,
            reason=reason,
            target_paths=[target.relative_to(self.config.repo_root).as_posix()],
            before={"target": before},
            after={"target": after},
            backup={"path": backup_path, "needed": True},
            extra={
                "target_path": target.relative_to(self.config.repo_root).as_posix(),
                "backup_path": backup_path,
                "existed_before": True,
            },
        )
        self.journal.record(record, payload)
        return FileWriteResult(
            change_id=change_id,
            path=target.relative_to(self.config.repo_root).as_posix(),
            bytes_written=target.stat().st_size,
            reason=reason,
        )

    def move_path(
        self, source_relative_path: str, dest_relative_path: str, reason: str, dry_run: bool = False
    ) -> FileWriteResult | dict[str, Any]:
        source = self._resolve_target(source_relative_path)
        destination = self._resolve_target(dest_relative_path)
        if not source.exists():
            raise FileNotFoundError(source_relative_path)
        if source == destination:
            raise ValueError("source and destination must be different")
        change_id = self.journal.next_change_id()
        source_before = self._file_meta(source)
        destination_existed_before = destination.exists()
        destination_before = self._file_meta(destination)
        source_backup_preview = self.journal.planned_backup_path(change_id, self.config.repo_root, source)
        dest_backup_preview = self.journal.planned_backup_path(change_id, self.config.repo_root, destination)
        command = f"move_path --source {source_relative_path} --dest {dest_relative_path}"
        if dry_run:
            return self._dry_run_plan(
                mutation_id=change_id,
                mutation_action="move",
                command=command,
                reason=reason,
                target_paths=[
                    source.relative_to(self.config.repo_root).as_posix(),
                    destination.relative_to(self.config.repo_root).as_posix(),
                ],
                before={"source": source_before, "destination": destination_before},
                after={
                    "source": {"exists": False},
                    "destination": {"exists": True, "bytes": source_before.get("bytes", 0)},
                },
                backup={
                    "source_path": source_backup_preview,
                    "destination_path": dest_backup_preview if destination_existed_before else "",
                    "destination_needed": destination_existed_before,
                },
                extra={
                    "source_path": source.relative_to(self.config.repo_root).as_posix(),
                    "destination_path": destination.relative_to(self.config.repo_root).as_posix(),
                },
            )

        source_backup = self.journal.backup_file(change_id, self.config.repo_root, source)
        destination_backup = self.journal.backup_file(change_id, self.config.repo_root, destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))
        destination_after = self._file_meta(destination)

        record = ChangeRecord(
            change_id=change_id,
            action="patch",
            target_paths=[
                source.relative_to(self.config.repo_root).as_posix(),
                destination.relative_to(self.config.repo_root).as_posix(),
            ],
            reason=reason,
            created_at=datetime.now(timezone.utc),
        )
        payload = self._journal_payload(
            mutation_id=change_id,
            mutation_action="move",
            command=command,
            reason=reason,
            target_paths=[
                source.relative_to(self.config.repo_root).as_posix(),
                destination.relative_to(self.config.repo_root).as_posix(),
            ],
            before={"source": source_before, "destination": destination_before},
            after={"source": {"exists": False}, "destination": destination_after},
            backup={
                "source_path": source_backup,
                "destination_path": destination_backup,
                "destination_needed": destination_existed_before,
            },
            extra={
                "source_path": source.relative_to(self.config.repo_root).as_posix(),
                "destination_path": destination.relative_to(self.config.repo_root).as_posix(),
                "destination_existed_before": destination_existed_before,
            },
        )
        self.journal.record(record, payload)
        return FileWriteResult(
            change_id=change_id,
            path=destination.relative_to(self.config.repo_root).as_posix(),
            bytes_written=int(destination_after.get("bytes") or 0),
            reason=reason,
        )

    def archive_paths(
        self, relative_paths: list[str], slug: str, reason: str, dry_run: bool = False
    ) -> ArchiveResult | dict[str, Any]:
        slug = slug.strip()
        if not slug:
            raise ValueError("slug is required")
        if not _ARCHIVE_SLUG_RE.fullmatch(slug):
            raise ValueError("slug must use only letters, numbers, dots, underscores, and hyphens")
        if not relative_paths:
            raise ValueError("at least one path is required")

        targets: list[Path] = []
        seen_targets: set[Path] = set()
        for relative in relative_paths:
            target = self._resolve_target(relative)
            if target in seen_targets:
                raise ValueError(f"duplicate archive path: {relative}")
            if not target.exists():
                raise FileNotFoundError(relative)
            seen_targets.add(target)
            targets.append(target)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        archive_dir = self.config.archive_root / f"{timestamp}_{slug}"
        command = f"archive_paths --slug {slug}"
        change_id = self.journal.next_change_id()
        planned_moves: list[dict[str, str]] = []
        reserved: set[Path] = set()
        for target in targets:
            archived = archive_dir / target.name
            counter = 1
            while archived in reserved:
                archived = archive_dir / f"{counter}_{target.name}"
                counter += 1
            reserved.add(archived)
            planned_moves.append(
                {
                    "original_path": target.relative_to(self.config.repo_root).as_posix(),
                    "archived_path": archived.relative_to(self.config.repo_root).as_posix(),
                }
            )
        if dry_run:
            return self._dry_run_plan(
                mutation_id=change_id,
                mutation_action="archive",
                command=command,
                reason=reason,
                target_paths=[target.relative_to(self.config.repo_root).as_posix() for target in targets],
                before={"targets": {item["original_path"]: self._file_meta(self._resolve_target(item["original_path"])) for item in planned_moves}},
                after={"archive_root": archive_dir.relative_to(self.config.repo_root).as_posix(), "moves": planned_moves},
                backup={"path": "", "needed": False},
                extra={"archive_root": archive_dir.relative_to(self.config.repo_root).as_posix(), "moves": planned_moves},
            )

        archive_dir.mkdir(parents=True, exist_ok=False)
        moved: list[str] = []
        payload_moves: list[dict[str, str]] = []
        before_targets: dict[str, Any] = {}

        for target in targets:
            before_targets[target.relative_to(self.config.repo_root).as_posix()] = self._file_meta(target)
            archived = archive_dir / target.name
            counter = 1
            while archived.exists():
                archived = archive_dir / f"{counter}_{target.name}"
                counter += 1
            archived.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(archived))
            moved.append(target.relative_to(self.config.repo_root).as_posix())
            payload_moves.append(
                {
                    "original_path": target.relative_to(self.config.repo_root).as_posix(),
                    "archived_path": archived.relative_to(self.config.repo_root).as_posix(),
                }
            )

        record = ChangeRecord(
            change_id=change_id,
            action="archive",
            target_paths=moved,
            reason=reason,
            created_at=datetime.now(timezone.utc),
        )
        payload = self._journal_payload(
            mutation_id=change_id,
            mutation_action="archive",
            command=command,
            reason=reason,
            target_paths=moved,
            before={"targets": before_targets},
            after={"archive_root": archive_dir.relative_to(self.config.repo_root).as_posix(), "moves": payload_moves},
            backup={"path": "", "needed": False},
            extra={
                "archive_root": archive_dir.relative_to(self.config.repo_root).as_posix(),
                "moves": payload_moves,
            },
        )
        self.journal.record(record, payload)
        return ArchiveResult(
            change_id=change_id,
            archived_to=archive_dir.relative_to(self.config.repo_root).as_posix(),
            moved=moved,
            reason=reason,
        )
