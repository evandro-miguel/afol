from __future__ import annotations

import hashlib
import hmac
import json
import os
import shutil
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from agentic_scaffold.config import DEFAULT_BLOCKLIST
from agentic_scaffold.models import ChangeRecord, UndoResult

_FALLBACK_COUNTER = 0
_UNDO_EXTRA_PROTECTED_PATHS: tuple[str, ...] = (".agents/wb/.active_session",)


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

    @property
    def integrity_key_file(self) -> Path:
        return self.root / "integrity.key"


class JournalStore:
    def __init__(self, root: Path) -> None:
        self.paths = JournalPaths(root=root)
        self.paths.entries_dir.mkdir(parents=True, exist_ok=True)
        self.paths.backups_dir.mkdir(parents=True, exist_ok=True)
        self._integrity_key = self._load_or_create_integrity_key()

    def _load_or_create_integrity_key(self) -> bytes:
        key_path = self.paths.integrity_key_file
        key_path.parent.mkdir(parents=True, exist_ok=True)
        if not key_path.exists():
            fd = os.open(str(key_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(os.urandom(32))
            except Exception:
                key_path.unlink(missing_ok=True)
                raise
        try:
            os.chmod(key_path, 0o600)
        except PermissionError:
            pass
        key = key_path.read_bytes()
        if len(key) < 32:
            raise UnsafeJournalPathError("journal integrity key is malformed")
        return key

    def _integrity_material(self, record: dict, payload: dict) -> dict:
        return {
            "change_id": str(record.get("change_id", "")).strip(),
            "timestamp": str(record.get("created_at", "")).strip(),
            "record": record,
            "payload": payload,
        }

    def _sign_integrity(self, record: dict, payload: dict) -> str:
        material = self._integrity_material(record, payload)
        encoded = json.dumps(material, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hmac.new(self._integrity_key, encoded, hashlib.sha256).hexdigest()

    def _verify_integrity(self, record: dict, payload: dict, integrity: object) -> None:
        if not isinstance(integrity, dict):
            raise UnsafeJournalPathError("journal integrity metadata is missing")
        algorithm = str(integrity.get("algorithm", "")).strip().lower()
        signature = str(integrity.get("signature", "")).strip().lower()
        if algorithm != "hmac-sha256" or not signature:
            raise UnsafeJournalPathError("journal integrity metadata is malformed")
        expected_signature = self._sign_integrity(record, payload)
        if not hmac.compare_digest(signature, expected_signature):
            raise UnsafeJournalPathError("journal integrity verification failed")

    def next_change_id(self) -> str:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return f"chg_{stamp}_{_change_id_suffix()}"

    def record(self, record: ChangeRecord, payload: dict) -> None:
        target = self.paths.entries_dir / f"{record.change_id}.json"
        record_dump = record.model_dump(mode="json")
        document = {
            "record": record_dump,
            "payload": payload,
            "integrity": {
                "algorithm": "hmac-sha256",
                "signature": self._sign_integrity(record_dump, payload),
            },
        }
        target.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def list_change_files(self) -> list[Path]:
        return sorted(self.paths.entries_dir.glob("chg_*.json"))

    def latest_change_file(self) -> Path | None:
        files = self.list_change_files()
        return files[-1] if files else None

    def load(self, change_file: Path) -> dict:
        return json.loads(change_file.read_text(encoding="utf-8"))

    def _record_target_paths(self, record: dict) -> list[str]:
        raw_target_paths = record.get("target_paths")
        if not isinstance(raw_target_paths, list) or not raw_target_paths:
            raise UnsafeJournalPathError("journal record target paths are malformed")
        normalized: list[str] = []
        for raw_path in raw_target_paths:
            path = str(raw_path).strip()
            if not path:
                raise UnsafeJournalPathError("journal record target path is empty")
            normalized.append(path)
        return normalized

    def _resolve_repo_path(self, repo_root: Path, relative_path: str, *, blocked_paths: tuple[str, ...] = ()) -> Path:
        if not str(relative_path).strip():
            raise UnsafeJournalPathError("journal path is empty")
        root = repo_root.resolve()
        target = (root / relative_path).resolve()
        try:
            relative = target.relative_to(root).as_posix()
        except ValueError as exc:
            raise UnsafeJournalPathError("journal path is outside the repository") from exc
        if target == root:
            raise UnsafeJournalPathError("journal path cannot target the repository root")
        for blocked in blocked_paths:
            if relative == blocked or relative.startswith(f"{blocked}/"):
                raise UnsafeJournalPathError(f"journal path is blocked: {relative}")
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

    def expected_backup_path(
        self, change_id: str, repo_root: Path, target_relative: str, *, blocked_paths: tuple[str, ...] = ()
    ) -> str:
        target_path = self._resolve_repo_path(repo_root, target_relative, blocked_paths=blocked_paths)
        return self.planned_backup_path(change_id, repo_root.resolve(), target_path)

    def restore_backup(
        self, repo_root: Path, backup_relative: str, target_relative: str, *, blocked_paths: tuple[str, ...] = ()
    ) -> Path:
        backup_path = self._resolve_backup_path(backup_relative)
        target_path = self._resolve_repo_path(repo_root, target_relative, blocked_paths=blocked_paths)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_path, target_path)
        return target_path

    def delete_if_exists(self, repo_root: Path, relative_path: str, *, blocked_paths: tuple[str, ...] = ()) -> None:
        target = self._resolve_repo_path(repo_root, relative_path, blocked_paths=blocked_paths)
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        elif target.exists():
            target.unlink(missing_ok=True)

    def move_path(
        self, repo_root: Path, source_relative: str, dest_relative: str, *, blocked_paths: tuple[str, ...] = ()
    ) -> Path:
        source = self._resolve_repo_path(repo_root, source_relative, blocked_paths=blocked_paths)
        destination = self._resolve_repo_path(repo_root, dest_relative, blocked_paths=blocked_paths)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))
        return destination

    def undo_latest(self, repo_root: Path) -> UndoResult:
        change_file = self.latest_change_file()
        if change_file is None:
            return UndoResult(ok=False, message="No recorded change is available to undo.")

        data = self.load(change_file)
        if not isinstance(data, dict):
            raise UnsafeJournalPathError("journal entry is malformed")
        record = data.get("record")
        payload = data.get("payload")
        if not isinstance(record, dict):
            raise UnsafeJournalPathError("journal record is malformed")
        if not isinstance(payload, dict):
            raise UnsafeJournalPathError("journal payload is malformed")
        self._verify_integrity(record, payload, data.get("integrity"))
        change_id = str(record.get("change_id", "")).strip()
        if not change_id:
            raise UnsafeJournalPathError("journal record is missing change id")
        if change_file.name != f"{change_id}.json":
            raise UnsafeJournalPathError("journal entry filename does not match record change id")
        if bool(payload.get("dry_run", False)):
            raise UnsafeJournalPathError("journal entry marked as dry-run cannot be undone")
        payload_action = str(payload.get("mutation_action", "")).strip()
        record_action = str(record.get("action", "")).strip()
        if payload_action and record_action and payload_action != record_action:
            raise UnsafeJournalPathError("journal action mismatch between record and payload")
        if not payload_action and record_action == "patch" and (
            "source_path" in payload or "destination_path" in payload
        ):
            raise UnsafeJournalPathError("journal move entry missing mutation_action")
        mutation_action = payload_action or record_action
        if mutation_action not in {"write_text", "patch", "move", "archive"}:
            raise UnsafeJournalPathError(f"unsupported journal mutation action: {mutation_action or 'unknown'}")
        record_target_paths = self._record_target_paths(record)
        protected_paths = tuple(dict.fromkeys((*DEFAULT_BLOCKLIST, *_UNDO_EXTRA_PROTECTED_PATHS)))
        restored: list[str] = []

        if mutation_action in {"write_text", "patch"}:
            if len(record_target_paths) != 1:
                raise UnsafeJournalPathError("journal write entry has invalid target path count")
            expected_target = record_target_paths[0]
            payload_target = str(payload.get("target_path", "")).strip()
            if payload_target != expected_target:
                raise UnsafeJournalPathError("journal target path mismatch for write undo")
            backup = str(payload.get("backup_path", "")).strip()
            existed_before = bool(payload.get("existed_before", False))
            target_path = self._resolve_repo_path(repo_root, expected_target, blocked_paths=protected_paths)
            if existed_before and not backup:
                raise UnsafeJournalPathError("journal entry missing backup for existing target")
            if backup:
                expected_backup = self.expected_backup_path(
                    change_id,
                    repo_root,
                    expected_target,
                    blocked_paths=protected_paths,
                )
                if backup != expected_backup:
                    raise UnsafeJournalPathError("journal backup path does not match expected backup target")
                self._resolve_backup_path(backup)
            if backup:
                restored_path = self.restore_backup(repo_root, backup, expected_target, blocked_paths=protected_paths)
                restored.append(restored_path.relative_to(repo_root).as_posix())
            elif not existed_before:
                self.delete_if_exists(repo_root, expected_target, blocked_paths=protected_paths)
                restored.append(target_path.relative_to(repo_root.resolve()).as_posix())
        elif mutation_action == "move":
            if len(record_target_paths) != 2:
                raise UnsafeJournalPathError("journal move entry has invalid target path count")
            expected_source_relative, expected_destination_relative = record_target_paths
            payload_source_relative = str(payload.get("source_path", "")).strip()
            payload_destination_relative = str(payload.get("destination_path", "")).strip()
            if (
                payload_source_relative != expected_source_relative
                or payload_destination_relative != expected_destination_relative
            ):
                raise UnsafeJournalPathError("journal move paths mismatch for undo")
            destination_existed_before = bool(payload.get("destination_existed_before", False))
            self._resolve_repo_path(repo_root, expected_source_relative, blocked_paths=protected_paths)
            self._resolve_repo_path(repo_root, expected_destination_relative, blocked_paths=protected_paths)
            restored.append(expected_source_relative)
            destination_backup = str(payload.get("backup", {}).get("destination_path", "")).strip()
            if destination_existed_before and not destination_backup:
                raise UnsafeJournalPathError("journal entry missing destination backup for move undo")
            if destination_backup:
                expected_destination_backup = self.expected_backup_path(
                    change_id,
                    repo_root,
                    expected_destination_relative,
                    blocked_paths=protected_paths,
                )
                if destination_backup != expected_destination_backup:
                    raise UnsafeJournalPathError("journal destination backup path does not match expected backup target")
                self._resolve_backup_path(destination_backup)
            self.move_path(
                repo_root,
                expected_destination_relative,
                expected_source_relative,
                blocked_paths=protected_paths,
            )
            if destination_existed_before and destination_backup:
                restored_destination = self.restore_backup(
                    repo_root,
                    destination_backup,
                    expected_destination_relative,
                    blocked_paths=protected_paths,
                )
                restored.append(restored_destination.relative_to(repo_root).as_posix())
        elif mutation_action == "archive":
            if not record_target_paths:
                raise UnsafeJournalPathError("journal archive entry has no recorded targets")
            archive_root = str(payload.get("archive_root", "")).strip()
            moves = payload.get("moves", [])
            if not isinstance(moves, list):
                raise UnsafeJournalPathError("journal archive moves payload is malformed")
            archive_dir = self._resolve_repo_path(repo_root, archive_root, blocked_paths=protected_paths)
            if len(moves) != len(record_target_paths):
                raise UnsafeJournalPathError("journal archive moves count mismatch")
            validated_moves: list[tuple[str, str]] = []
            for expected_original_relative, item in zip(record_target_paths, moves, strict=True):
                if not isinstance(item, dict):
                    raise UnsafeJournalPathError("journal archive move item is malformed")
                archived_relative = str(item.get("archived_path", "")).strip()
                original_relative = str(item.get("original_path", "")).strip()
                if original_relative != expected_original_relative:
                    raise UnsafeJournalPathError("journal archive target path mismatch for undo")
                archived_path = self._resolve_repo_path(repo_root, archived_relative, blocked_paths=protected_paths)
                self._resolve_repo_path(repo_root, expected_original_relative, blocked_paths=protected_paths)
                try:
                    archived_path.relative_to(archive_dir)
                except ValueError as exc:
                    raise UnsafeJournalPathError("journal archive source path is outside archive root") from exc
                validated_moves.append((archived_relative, expected_original_relative))
            for archived_relative, original_relative in validated_moves:
                self.move_path(
                    repo_root,
                    archived_relative,
                    original_relative,
                    blocked_paths=protected_paths,
                )
                restored.append(original_relative)
            if archive_dir.exists() and not any(archive_dir.iterdir()):
                archive_dir.rmdir()
        else:
            return UndoResult(ok=False, message=f"Unsupported undo action: {mutation_action}")

        change_file.unlink(missing_ok=True)
        backup_dir = self.paths.backups_dir / change_id
        if backup_dir.exists():
            shutil.rmtree(backup_dir, ignore_errors=True)

        return UndoResult(ok=True, message=f"Undo applied for {change_id}.", restored_paths=restored)
