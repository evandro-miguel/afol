from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from agentic_scaffold.models import ChangeRecord, UndoResult

_FALLBACK_COUNTER = 0


class UnsafeJournalPathError(ValueError):
    pass


def _change_id_suffix() -> str:
    global _FALLBACK_COUNTER
    try:
        return uuid4().hex[:8]
    except (NotImplementedError, OSError, PermissionError):
        _FALLBACK_COUNTER += 1
        seed = f"{os.getpid()}:{time.monotonic_ns()}:{_FALLBACK_COUNTER}"
        return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:8]


@dataclass(frozen=True)
class JournalPaths:
    root: Path

    @property
    def entries_dir(self) -> Path:
        return self.root / "entries"

    @property
    def backups_dir(self) -> Path:
        return self.root / "backups"


class JournalStore:
    def __init__(self, root: Path) -> None:
        self.paths = JournalPaths(root=root)
        self.paths.entries_dir.mkdir(parents=True, exist_ok=True)
        self.paths.backups_dir.mkdir(parents=True, exist_ok=True)

    def next_change_id(self) -> str:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return f"chg_{stamp}_{_change_id_suffix()}"

    def record(self, record: ChangeRecord, payload: dict) -> None:
        target = self.paths.entries_dir / f"{record.change_id}.json"
        document = {
            "record": record.model_dump(mode="json"),
            "payload": payload,
        }
        target.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def list_change_files(self) -> list[Path]:
        return sorted(self.paths.entries_dir.glob("chg_*.json"))

    def latest_change_file(self) -> Path | None:
        files = self.list_change_files()
        return files[-1] if files else None

    def load(self, change_file: Path) -> dict:
        return json.loads(change_file.read_text(encoding="utf-8"))

    def _resolve_repo_path(self, repo_root: Path, relative_path: str) -> Path:
        if not str(relative_path).strip():
            raise UnsafeJournalPathError("journal path is empty")
        root = repo_root.resolve()
        target = (root / relative_path).resolve()
        try:
            target.relative_to(root)
        except ValueError as exc:
            raise UnsafeJournalPathError("journal path is outside the repository") from exc
        if target == root:
            raise UnsafeJournalPathError("journal path cannot target the repository root")
        return target

    def _resolve_backup_path(self, backup_relative: str) -> Path:
        if not str(backup_relative).strip():
            raise UnsafeJournalPathError("backup path is empty")
        backups_root = self.paths.backups_dir.resolve()
        backup_path = (self.paths.root / backup_relative).resolve()
        try:
            backup_path.relative_to(backups_root)
        except ValueError as exc:
            raise UnsafeJournalPathError("backup path is outside the runtime journal backups") from exc
        return backup_path

    def backup_file(self, change_id: str, repo_root: Path, target: Path) -> str:
        relative = target.relative_to(repo_root).as_posix()
        safe_name = relative.replace("/", "__")
        backup_dir = self.paths.backups_dir / change_id
        backup_dir.mkdir(parents=True, exist_ok=True)
        if target.exists():
            backup_path = backup_dir / safe_name
            shutil.copy2(target, backup_path)
            return str(backup_path.relative_to(self.paths.root))
        return ""

    def planned_backup_path(self, change_id: str, repo_root: Path, target: Path) -> str:
        relative = target.relative_to(repo_root).as_posix()
        safe_name = relative.replace("/", "__")
        backup_path = self.paths.backups_dir / change_id / safe_name
        return str(backup_path.relative_to(self.paths.root))

    def restore_backup(self, repo_root: Path, backup_relative: str, target_relative: str) -> Path:
        backup_path = self._resolve_backup_path(backup_relative)
        target_path = self._resolve_repo_path(repo_root, target_relative)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_path, target_path)
        return target_path

    def delete_if_exists(self, repo_root: Path, relative_path: str) -> None:
        target = self._resolve_repo_path(repo_root, relative_path)
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        elif target.exists():
            target.unlink(missing_ok=True)

    def move_path(self, repo_root: Path, source_relative: str, dest_relative: str) -> Path:
        source = self._resolve_repo_path(repo_root, source_relative)
        destination = self._resolve_repo_path(repo_root, dest_relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))
        return destination

    def undo_latest(self, repo_root: Path) -> UndoResult:
        change_file = self.latest_change_file()
        if change_file is None:
            return UndoResult(ok=False, message="No recorded change is available to undo.")

        data = self.load(change_file)
        record = ChangeRecord.model_validate(data["record"])
        payload = data["payload"]
        if change_file.name != f"{record.change_id}.json":
            raise UnsafeJournalPathError("journal entry filename does not match record change id")
        if bool(payload.get("dry_run", False)):
            raise UnsafeJournalPathError("journal entry marked as dry-run cannot be undone")
        mutation_action = str(payload.get("mutation_action") or record.action).strip()
        restored: list[str] = []

        if mutation_action in {"write_text", "patch"}:
            target = payload["target_path"]
            backup = payload.get("backup_path", "")
            existed_before = bool(payload.get("existed_before", False))
            if backup:
                restored_path = self.restore_backup(repo_root, backup, target)
                restored.append(restored_path.relative_to(repo_root).as_posix())
            elif not existed_before:
                self.delete_if_exists(repo_root, target)
                restored.append(str(target))
        elif mutation_action == "move":
            source_relative = payload["source_path"]
            destination_relative = payload["destination_path"]
            destination_existed_before = bool(payload.get("destination_existed_before", False))
            self.move_path(repo_root, destination_relative, source_relative)
            restored.append(source_relative)
            destination_backup = str(payload.get("backup", {}).get("destination_path", "")).strip()
            if destination_existed_before and destination_backup:
                restored_destination = self.restore_backup(repo_root, destination_backup, destination_relative)
                restored.append(restored_destination.relative_to(repo_root).as_posix())
        elif mutation_action == "archive":
            archive_root = payload["archive_root"]
            for item in payload.get("moves", []):
                archived_relative = item["archived_path"]
                original_relative = item["original_path"]
                self.move_path(repo_root, archived_relative, original_relative)
                restored.append(original_relative)
            archive_dir = self._resolve_repo_path(repo_root, archive_root)
            if archive_dir.exists() and not any(archive_dir.iterdir()):
                archive_dir.rmdir()
        else:
            return UndoResult(ok=False, message=f"Unsupported undo action: {mutation_action}")

        change_file.unlink(missing_ok=True)
        backup_dir = self.paths.backups_dir / record.change_id
        if backup_dir.exists():
            shutil.rmtree(backup_dir, ignore_errors=True)

        return UndoResult(ok=True, message=f"Undo applied for {record.change_id}.", restored_paths=restored)
