#!/usr/bin/env python3
"""
Backup system for agentic updates.
Implements skeleton + delta backup strategy.
"""

import json
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from manifest import Manifest
from conflict import FileChange, ChangeType


@dataclass
class BackupIndex:
    """Index of files in the backup."""

    version_from: str
    version_to: str
    created_at: str
    backup_type: str  # "skeleton+delta"
    system_files: List[str] = field(default_factory=list)
    delta_files: List[str] = field(default_factory=list)
    user_data_refs: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "version_from": self.version_from,
            "version_to": self.version_to,
            "created_at": self.created_at,
            "backup_type": self.backup_type,
            "system_files": self.system_files,
            "delta_files": self.delta_files,
            "user_data_refs": self.user_data_refs,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BackupIndex":
        return cls(
            version_from=data["version_from"],
            version_to=data["version_to"],
            created_at=data["created_at"],
            backup_type=data.get("backup_type", "skeleton+delta"),
            system_files=data.get("system_files", []),
            delta_files=data.get("delta_files", []),
            user_data_refs=data.get("user_data_refs", []),
        )


@dataclass
class RestorePoint:
    """Metadata for rollback restoration."""

    version_from: str
    version_to: str
    timestamp: str
    manifest_before: dict  # Manifest state before update
    manifest_after: dict  # Manifest state after update (if completed)
    changes_applied: List[dict]  # List of FileChange dicts
    backup_path: str
    completed: bool = False

    def to_dict(self) -> dict:
        return {
            "version_from": self.version_from,
            "version_to": self.version_to,
            "timestamp": self.timestamp,
            "manifest_before": self.manifest_before,
            "manifest_after": self.manifest_after,
            "changes_applied": self.changes_applied,
            "backup_path": self.backup_path,
            "completed": self.completed,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "RestorePoint":
        return cls(
            version_from=data["version_from"],
            version_to=data["version_to"],
            timestamp=data["timestamp"],
            manifest_before=data["manifest_before"],
            manifest_after=data.get("manifest_after", {}),
            changes_applied=data.get("changes_applied", []),
            backup_path=data["backup_path"],
            completed=data.get("completed", False),
        )


class BackupManager:
    """
    Manages skeleton + delta backups for agentic system updates.

    Skeleton: Directory tree structure + manifests
    Delta: Only files that will be modified or deleted
    """

    MAX_BACKUPS = 5  # Keep last 5 backups

    def __init__(self, agents_dir: Path, z_arq_dir: Optional[Path] = None):
        self.agents_dir = agents_dir
        self.z_arq_dir = z_arq_dir or agents_dir / "z-arq"
        self.z_arq_dir.mkdir(parents=True, exist_ok=True)

    def create_backup(
        self,
        version_from: str,
        version_to: str,
        changes: List[FileChange],
        current_manifest: Manifest,
    ) -> Path:
        """
        Create skeleton + delta backup.

        Args:
            version_from: Current version
            version_to: Target version
            changes: List of planned changes
            current_manifest: Current system manifest

        Returns:
            Path to backup directory
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{timestamp}_update_{version_from}_to_{version_to}"
        backup_dir = self.z_arq_dir / backup_name
        backup_dir.mkdir(parents=True, exist_ok=True)

        print(f"   Creating backup: {backup_name}")

        # 1. Create skeleton tree
        skeleton_dir = backup_dir / "skeleton"
        self._create_skeleton_tree(skeleton_dir)

        # 2. Create system manifest before
        manifest_path = backup_dir / "system-manifest-before.json"
        current_manifest.save(manifest_path)

        # 3. Create delta for files to be modified/deleted
        delta_dir = backup_dir / "delta"
        delta_dir.mkdir(exist_ok=True)

        delta_files = []
        for change in changes:
            if change.change_type in [
                ChangeType.SAFE_UPDATE,
                ChangeType.USER_MODIFIED,
                ChangeType.CONFLICT,
                ChangeType.DELETED_UPSTREAM,
            ]:
                # Backup the file that will be changed
                src_path = self.agents_dir / change.path
                if src_path.exists():
                    dst_path = delta_dir / change.path
                    dst_path.parent.mkdir(parents=True, exist_ok=True)

                    if src_path.is_file():
                        shutil.copy2(src_path, dst_path)
                        delta_files.append(change.path)

        # 4. Create backup index
        index = BackupIndex(
            version_from=version_from,
            version_to=version_to,
            created_at=datetime.now().isoformat(),
            backup_type="skeleton+delta",
            system_files=list(current_manifest.files.keys()),
            delta_files=delta_files,
            user_data_refs=self._get_user_data_refs(),
        )

        index_path = backup_dir / "backup-index.json"
        with open(index_path, "w") as f:
            json.dump(index.to_dict(), f, indent=2)

        # 5. Create restore point
        restore_point = RestorePoint(
            version_from=version_from,
            version_to=version_to,
            timestamp=datetime.now().isoformat(),
            manifest_before=current_manifest.to_dict(),
            manifest_after={},
            changes_applied=[
                {
                    "path": c.path,
                    "type": c.change_type.name,
                    "base_hash": c.base_hash,
                    "local_hash": c.local_hash,
                    "upstream_hash": c.upstream_hash,
                }
                for c in changes
            ],
            backup_path=str(backup_dir),
            completed=False,
        )

        restore_path = backup_dir / "restore-point.json"
        with open(restore_path, "w") as f:
            json.dump(restore_point.to_dict(), f, indent=2)

        print(f"   ✓ Backup created: {backup_dir}")
        print(f"   ✓ Delta files: {len(delta_files)}")

        # 6. Cleanup old backups
        self._cleanup_old_backups()

        return backup_dir

    def _create_skeleton_tree(self, skeleton_dir: Path) -> None:
        """Create skeleton tree structure (dirs + empty files)."""
        for path in self.agents_dir.rglob("*"):
            rel_path = path.relative_to(self.agents_dir)

            # Skip cache and temp directories
            if any(part.startswith(".") for part in rel_path.parts):
                continue

            skeleton_path = skeleton_dir / rel_path

            if path.is_dir():
                skeleton_path.mkdir(parents=True, exist_ok=True)
            elif path.is_file():
                # Create empty file as placeholder
                skeleton_path.parent.mkdir(parents=True, exist_ok=True)
                skeleton_path.touch()

    def _get_user_data_refs(self) -> List[str]:
        """Get references to user data paths."""
        refs = []
        user_paths = ["wb", "arc/SPECS", "arc/DECISIONS", "a-docs/lessons", "z-arq"]

        for user_path in user_paths:
            full_path = self.agents_dir / user_path
            if full_path.exists():
                refs.append(user_path)

        return refs

    def _cleanup_old_backups(self) -> None:
        """Remove old backups keeping only MAX_BACKUPS most recent."""
        backups = self.list_backups()

        if len(backups) > self.MAX_BACKUPS:
            to_remove = backups[self.MAX_BACKUPS :]
            for backup_dir in to_remove:
                print(f"   Cleaning up old backup: {backup_dir.name}")
                shutil.rmtree(backup_dir)

    def list_backups(self) -> List[Path]:
        """List all backups sorted by creation time (newest first)."""
        backups = []

        for item in self.z_arq_dir.iterdir():
            if item.is_dir() and "_update_" in item.name:
                # Check if valid backup
                if (item / "backup-index.json").exists():
                    backups.append(item)

        # Sort by name (timestamp) descending
        backups.sort(key=lambda p: p.name, reverse=True)
        return backups

    def get_latest_backup(self) -> Optional[Path]:
        """Get the most recent backup."""
        backups = self.list_backups()
        return backups[0] if backups else None

    def get_restore_point(self, backup_dir: Path) -> Optional[RestorePoint]:
        """Get restore point from backup."""
        restore_path = backup_dir / "restore-point.json"

        if not restore_path.exists():
            return None

        with open(restore_path, "r") as f:
            return RestorePoint.from_dict(json.load(f))

    def restore_from_backup(self, backup_dir: Path, dry_run: bool = False) -> bool:
        """
        Restore system from backup.

        Args:
            backup_dir: Path to backup directory
            dry_run: If True, only show what would be restored

        Returns:
            True if successful
        """
        print(f"Restoring from backup: {backup_dir.name}")

        # Load restore point
        restore_point = self.get_restore_point(backup_dir)
        if not restore_point:
            print("   ❌ No restore point found in backup")
            return False

        # Load backup index
        index_path = backup_dir / "backup-index.json"
        with open(index_path, "r") as f:
            index = BackupIndex.from_dict(json.load(f))

        delta_dir = backup_dir / "delta"
        restored = 0

        # Restore each delta file
        for rel_path in index.delta_files:
            src_path = delta_dir / rel_path
            dst_path = self.agents_dir / rel_path

            if dry_run:
                print(f"   Would restore: {rel_path}")
            else:
                if src_path.exists():
                    dst_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src_path, dst_path)
                    restored += 1

        if not dry_run:
            print(f"   ✓ Restored {restored} files")

        return True

    def verify_backup(self, backup_dir: Path) -> bool:
        """Verify backup integrity."""
        print(f"Verifying backup: {backup_dir.name}")

        checks = [
            (backup_dir / "backup-index.json").exists(),
            (backup_dir / "restore-point.json").exists(),
            (backup_dir / "system-manifest-before.json").exists(),
            (backup_dir / "skeleton").exists(),
            (backup_dir / "delta").exists(),
        ]

        if all(checks):
            print("   ✓ Backup structure valid")
            return True
        else:
            print("   ❌ Backup structure invalid")
            return False


def create_backup_report(backup_dir: Path) -> str:
    """Create human-readable backup report."""
    index_path = backup_dir / "backup-index.json"

    if not index_path.exists():
        return f"Invalid backup: {backup_dir}"

    with open(index_path, "r") as f:
        index = BackupIndex.from_dict(json.load(f))

    lines = [
        f"Backup: {backup_dir.name}",
        f"  From: {index.version_from}",
        f"  To: {index.version_to}",
        f"  Created: {index.created_at}",
        f"  Type: {index.backup_type}",
        f"  System files: {len(index.system_files)}",
        f"  Delta files: {len(index.delta_files)}",
        f"  User data refs: {len(index.user_data_refs)}",
    ]

    return "\n".join(lines)


if __name__ == "__main__":
    import tempfile

    # Test backup manager
    with tempfile.TemporaryDirectory() as tmpdir:
        agents_dir = Path(tmpdir) / ".agents"
        agents_dir.mkdir(parents=True, exist_ok=True)

        # Create some test files
        (agents_dir / "scripts").mkdir()
        (agents_dir / "scripts" / "test.py").write_text("print('hello')")
        (agents_dir / "wb").mkdir()
        (agents_dir / "wb" / "session").mkdir()

        # Create manager
        manager = BackupManager(agents_dir)

        # Create mock manifest and changes
        from manifest import Manifest

        manifest = Manifest(version="1.0.0")

        # Test backup
        backup_dir = manager.create_backup(
            version_from="1.0.0",
            version_to="1.1.0",
            changes=[],
            current_manifest=manifest,
        )

        print(f"\nBackup created at: {backup_dir}")
        print(create_backup_report(backup_dir))
