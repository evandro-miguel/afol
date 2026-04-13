from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from agentic_scaffold.config import RuntimeConfig
from agentic_scaffold.models import ArchiveResult, ChangeRecord, FileWriteResult
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

    def write_text_file(self, relative_path: str, content: str, reason: str) -> FileWriteResult:
        target = self._resolve_target(relative_path)
        existed_before = target.exists()
        change_id = self.journal.next_change_id()
        backup_path = self.journal.backup_file(change_id, self.config.repo_root, target)

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

        record = ChangeRecord(
            change_id=change_id,
            action="write_text",
            target_paths=[target.relative_to(self.config.repo_root).as_posix()],
            reason=reason,
            created_at=datetime.now(timezone.utc),
        )
        self.journal.record(
            record,
            {
                "target_path": target.relative_to(self.config.repo_root).as_posix(),
                "backup_path": backup_path,
                "existed_before": existed_before,
            },
        )
        return FileWriteResult(
            change_id=change_id,
            path=target.relative_to(self.config.repo_root).as_posix(),
            bytes_written=len(content.encode("utf-8")),
            reason=reason,
        )

    def apply_unified_diff(self, relative_path: str, diff_text: str, reason: str) -> FileWriteResult:
        target = self._resolve_target(relative_path)
        if not target.exists():
            raise FileNotFoundError(relative_path)
        change_id = self.journal.next_change_id()
        backup_path = self.journal.backup_file(change_id, self.config.repo_root, target)

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".diff", delete=False) as handle:
            handle.write(diff_text)
            temp_patch_path = Path(handle.name)
        try:
            completed = subprocess.run(
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
            )
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

        record = ChangeRecord(
            change_id=change_id,
            action="patch",
            target_paths=[target.relative_to(self.config.repo_root).as_posix()],
            reason=reason,
            created_at=datetime.now(timezone.utc),
        )
        self.journal.record(
            record,
            {
                "target_path": target.relative_to(self.config.repo_root).as_posix(),
                "backup_path": backup_path,
                "existed_before": True,
            },
        )
        return FileWriteResult(
            change_id=change_id,
            path=target.relative_to(self.config.repo_root).as_posix(),
            bytes_written=target.stat().st_size,
            reason=reason,
        )

    def archive_paths(self, relative_paths: list[str], slug: str, reason: str) -> ArchiveResult:
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
        archive_dir.mkdir(parents=True, exist_ok=False)
        moved: list[str] = []
        payload_moves: list[dict[str, str]] = []
        change_id = self.journal.next_change_id()

        for target in targets:
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
        self.journal.record(
            record,
            {
                "archive_root": archive_dir.relative_to(self.config.repo_root).as_posix(),
                "moves": payload_moves,
            },
        )
        return ArchiveResult(
            change_id=change_id,
            archived_to=archive_dir.relative_to(self.config.repo_root).as_posix(),
            moved=moved,
            reason=reason,
        )
