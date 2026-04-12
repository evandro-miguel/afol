from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from agentic_scaffold.models import ChangeRecord, UndoResult


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
        return f"chg_{stamp}_{uuid4().hex[:8]}"

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

    def restore_backup(self, repo_root: Path, backup_relative: str, target_relative: str) -> Path:
        backup_path = self.paths.root / backup_relative
        target_path = repo_root / target_relative
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_path, target_path)
        return target_path

    def delete_if_exists(self, repo_root: Path, relative_path: str) -> None:
        target = repo_root / relative_path
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        elif target.exists():
            target.unlink(missing_ok=True)

    def move_path(self, repo_root: Path, source_relative: str, dest_relative: str) -> Path:
        source = repo_root / source_relative
        destination = repo_root / dest_relative
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
        restored: list[str] = []

        if record.action in {"write_text", "patch"}:
            target = payload["target_path"]
            backup = payload.get("backup_path", "")
            existed_before = bool(payload.get("existed_before", False))
            if backup:
                restored_path = self.restore_backup(repo_root, backup, target)
                restored.append(str(restored_path.relative_to(repo_root)))
            elif not existed_before:
                self.delete_if_exists(repo_root, target)
                restored.append(target)
        elif record.action == "archive":
            archive_root = payload["archive_root"]
            for item in payload.get("moves", []):
                archived_relative = item["archived_path"]
                original_relative = item["original_path"]
                self.move_path(repo_root, archived_relative, original_relative)
                restored.append(original_relative)
            archive_dir = repo_root / archive_root
            if archive_dir.exists() and not any(archive_dir.iterdir()):
                archive_dir.rmdir()
        else:
            return UndoResult(ok=False, message=f"Unsupported undo action: {record.action}")

        change_file.unlink(missing_ok=True)
        backup_dir = self.paths.backups_dir / record.change_id
        if backup_dir.exists():
            shutil.rmtree(backup_dir, ignore_errors=True)

        return UndoResult(ok=True, message=f"Undo applied for {record.change_id}.", restored_paths=restored)
