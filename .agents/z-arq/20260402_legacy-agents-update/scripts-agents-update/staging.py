#!/usr/bin/env python3
"""
Staging system for agentic updates.
Prepares new version in isolated directory before atomic swap.
"""

import shutil
from pathlib import Path
from typing import List

from conflict import FileChange, ChangeType
from ownership import OwnershipMap


class StagingError(Exception):
    """Error during staging."""

    pass


class StagingManager:
    """
    Manages staging area for updates.
    Creates isolated environment for new version before swap.
    """

    def __init__(self, agents_dir: Path, version: str, upstream_path: Path):
        self.agents_dir = agents_dir
        self.version = version
        self.upstream_path = upstream_path
        self.staging_dir = agents_dir / "versions" / f"v{version}"

    def prepare(self, changes: List[FileChange], ownership: OwnershipMap) -> Path:
        """
        Prepare staging area with all changes applied.

        Args:
            changes: List of changes to apply
            ownership: Ownership map for path classification

        Returns:
            Path to staging directory
        """
        print(f"   Preparing staging area: {self.staging_dir}")

        # Clean existing staging
        if self.staging_dir.exists():
            shutil.rmtree(self.staging_dir)

        self.staging_dir.mkdir(parents=True)

        # 1. Copy user data (preserved)
        self._copy_user_data(ownership)

        # 2. Copy system files from upstream
        self._copy_upstream_system(ownership)

        # 3. Apply changes
        self._apply_changes(changes, ownership)

        # 4. Copy manifest and state files
        self._copy_metadata()

        print(f"   ✓ Staging prepared: {self.staging_dir}")
        return self.staging_dir

    def _copy_user_data(self, ownership: OwnershipMap) -> None:
        """Copy user data from current system to staging."""
        user_paths = [
            "wb",
            "arc/SPECS",
            "arc/DECISIONS",
            "a-docs/lessons",
            "data",
            "z-arq",
        ]

        for user_path in user_paths:
            src = self.agents_dir / user_path
            if src.exists():
                dst = self.staging_dir / user_path
                dst.parent.mkdir(parents=True, exist_ok=True)

                if src.is_dir():
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)

    def _copy_upstream_system(self, ownership: OwnershipMap) -> None:
        """Copy system files from upstream."""
        upstream_agents = self.upstream_path / ".agents"

        if not upstream_agents.exists():
            # If upstream doesn't have .agents, use root
            upstream_agents = self.upstream_path

        for src_path in upstream_agents.rglob("*"):
            rel_path = src_path.relative_to(upstream_agents)

            # Skip user paths
            if not ownership.is_updatable(str(rel_path)):
                continue

            dst_path = self.staging_dir / rel_path

            if src_path.is_dir():
                dst_path.mkdir(parents=True, exist_ok=True)
            elif src_path.is_file():
                dst_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dst_path)

    def _apply_changes(
        self, changes: List[FileChange], ownership: OwnershipMap
    ) -> None:
        """Apply specific changes to staging."""
        for change in changes:
            if not ownership.is_updatable(change.path):
                continue

            if change.change_type == ChangeType.DELETED_UPSTREAM:
                # Remove file from staging
                target = self.staging_dir / change.path
                if target.exists():
                    target.unlink()

            elif change.change_type == ChangeType.USER_MODIFIED:
                # Keep user's modified version (already copied in _copy_user_data check)
                pass

            elif change.change_type == ChangeType.CONFLICT:
                # Use upstream version but backup local
                src = self.upstream_path / ".agents" / change.path
                if src.exists():
                    dst = self.staging_dir / change.path
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)

    def _copy_metadata(self) -> None:
        """Copy manifest and state files."""
        # Copy manifest from upstream if exists
        upstream_manifest = self.upstream_path / ".agents" / "manifest.json"
        if upstream_manifest.exists():
            shutil.copy2(upstream_manifest, self.staging_dir / "manifest.json")

        # Copy ownership map
        ownership_map = self.agents_dir / "update-ownership.json"
        if ownership_map.exists():
            shutil.copy2(ownership_map, self.staging_dir / "update-ownership.json")

        # Copy agents wrapper
        agents_wrapper = self.agents_dir / "agents"
        if agents_wrapper.exists():
            shutil.copy2(agents_wrapper, self.staging_dir / "agents")

        # Copy agents-update wrapper
        update_wrapper = self.agents_dir / "agents-update"
        if update_wrapper.exists():
            shutil.copy2(update_wrapper, self.staging_dir / "agents-update")

    def validate(self) -> bool:
        """Validate staging area integrity."""
        print("   Validating staging area...")

        required = ["scripts", "agents", "agents-update", "manifest.json"]

        for item in required:
            path = self.staging_dir / item
            if not path.exists():
                raise StagingError(f"Missing required item: {item}")

        print("   ✓ Staging valid")
        return True

    def cleanup(self) -> None:
        """Remove staging directory."""
        if self.staging_dir.exists():
            shutil.rmtree(self.staging_dir)
            print(f"   Cleaned up staging: {self.staging_dir}")


if __name__ == "__main__":
    import tempfile

    # Test staging
    with tempfile.TemporaryDirectory() as tmpdir:
        agents_dir = Path(tmpdir) / ".agents"
        agents_dir.mkdir()

        # Create fake structure
        (agents_dir / "scripts").mkdir()
        (agents_dir / "scripts" / "test.py").write_text("# test")
        (agents_dir / "wb").mkdir()

        upstream_dir = Path(tmpdir) / "upstream"
        upstream_dir.mkdir()
        (upstream_dir / ".agents").mkdir()
        (upstream_dir / ".agents" / "scripts").mkdir()
        (upstream_dir / ".agents" / "scripts" / "test.py").write_text("# updated")

        # Create staging
        staging = StagingManager(agents_dir, "1.1.0", upstream_dir)

        from ownership import OwnershipMap, OwnershipRule, OwnershipType

        ownership = OwnershipMap(
            rules=[OwnershipRule(".", OwnershipType.SYSTEM, True)],
            default_policy=OwnershipType.SYSTEM,
        )

        try:
            staging_dir = staging.prepare([], ownership)
            print(f"\nStaging created at: {staging_dir}")

            # List contents
            for path in staging_dir.rglob("*"):
                rel = path.relative_to(staging_dir)
                print(f"  {rel}")
        except Exception as e:
            print(f"Error: {e}")
