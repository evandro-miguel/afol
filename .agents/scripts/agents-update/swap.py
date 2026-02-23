#!/usr/bin/env python3
"""
Atomic swap operations for agentic updates.
Implements platform-appropriate atomic swap strategies.
"""

import os
import platform
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Callable


class SwapError(Exception):
    """Error during atomic swap."""

    pass


class SwapManager:
    """
    Manages atomic swap of agentic system versions.
    Uses symlink swapping on Unix, rename/copy on Windows.
    """

    def __init__(self, agents_dir: Path):
        self.agents_dir = agents_dir
        self.current_link = agents_dir / "current"
        self.versions_dir = agents_dir / "versions"
        self.versions_dir.mkdir(exist_ok=True)

    def get_current_version_path(self) -> Optional[Path]:
        """Get path to currently active version."""
        if self.current_link.is_symlink():
            return Path(os.readlink(self.current_link))
        elif self.current_link.is_dir():
            return self.current_link
        return None

    def swap(
        self, new_version_path: Path, on_error: Optional[Callable[[], None]] = None
    ) -> bool:
        """
        Atomically swap to new version.

        Args:
            new_version_path: Path to staged new version
            on_error: Callback to run if swap fails

        Returns:
            True if successful
        """
        system = platform.system()

        if (
            system in ["Linux", "Darwin"]
            or "microsoft" in platform.uname().release.lower()
        ):
            # Unix/Linux/WSL - use symlink swapping
            return self._swap_unix(new_version_path, on_error)
        else:
            # Windows - use rename strategy
            return self._swap_windows(new_version_path, on_error)

    def _swap_unix(
        self, new_version_path: Path, on_error: Optional[Callable[[], None]]
    ) -> bool:
        """
        Unix atomic swap using symlinks.

        Process:
        1. Create new symlink pointing to new version
        2. Rename new symlink over current
        3. If failed, restore old
        """
        print("   Using Unix symlink swap strategy")

        # Get relative path for symlink
        try:
            rel_path = new_version_path.relative_to(self.agents_dir)
        except ValueError:
            # Not relative, use absolute
            rel_path = new_version_path

        # Create new symlink in temp location
        temp_link = self.agents_dir / ".current.new"

        try:
            # Remove temp link if exists
            if temp_link.exists() or temp_link.is_symlink():
                temp_link.unlink()

            # Create new symlink
            temp_link.symlink_to(rel_path)

            # Backup old current
            old_current = self.agents_dir / "current.old"
            if old_current.exists() or old_current.is_symlink():
                old_current.unlink()

            # Move current to backup (atomic on Unix)
            if self.current_link.exists() or self.current_link.is_symlink():
                self.current_link.rename(old_current)

            # Move new to current (atomic on Unix)
            temp_link.rename(self.current_link)

            print(f"   ✓ Swapped to: {rel_path}")
            return True

        except OSError as e:
            print(f"   ❌ Swap failed: {e}")

            # Cleanup temp link
            if temp_link.exists() or temp_link.is_symlink():
                temp_link.unlink()

            # Restore old current if exists
            if old_current.exists() and not self.current_link.exists():
                old_current.rename(self.current_link)

            if on_error:
                on_error()

            raise SwapError(f"Atomic swap failed: {e}")

    def _swap_windows(
        self, new_version_path: Path, on_error: Optional[Callable[[], None]]
    ) -> bool:
        """
        Windows swap using rename/copy strategy.

        Note: Windows doesn't have true atomic directory rename,
        so we use a careful sequence with validation.
        """
        print("   Using Windows rename strategy")

        current_backup = self.agents_dir / "current.old"

        try:
            # Step 1: Backup current
            if self.current_link.exists():
                if current_backup.exists():
                    shutil.rmtree(current_backup)

                # On Windows, rename is more reliable than copy for directories
                self.current_link.rename(current_backup)

            # Step 2: Copy new version to current
            shutil.copytree(new_version_path, self.current_link, dirs_exist_ok=True)

            # Step 3: Verify
            if not self._verify_swap():
                raise SwapError("Swap verification failed")

            print(f"   ✓ Swapped to: {new_version_path.name}")
            return True

        except Exception as e:
            print(f"   ❌ Swap failed: {e}")

            # Attempt rollback
            self._rollback_windows()

            if on_error:
                on_error()

            raise SwapError(f"Swap failed: {e}")

    def _verify_swap(self) -> bool:
        """Verify swap was successful."""
        checks = [
            self.current_link.exists(),
            (self.current_link / "scripts").exists(),
            (self.current_link / "agents").exists(),
        ]
        return all(checks)

    def _rollback_windows(self) -> None:
        """Rollback on Windows after failed swap."""
        current_backup = self.agents_dir / "current.old"

        try:
            # Remove failed current
            if self.current_link.exists():
                shutil.rmtree(self.current_link)

            # Restore backup
            if current_backup.exists():
                current_backup.rename(self.current_link)
                print("   ✓ Rolled back to previous version")
        except Exception as e:
            print(f"   ❌ Rollback failed: {e}")

    def rollback(self) -> bool:
        """
        Rollback to previous version.

        Returns:
            True if successful
        """
        old_current = self.agents_dir / "current.old"

        if not old_current.exists() and not old_current.is_symlink():
            print("   No previous version to rollback to")
            return False

        print("   Rolling back...")

        try:
            system = platform.system()

            if (
                system in ["Linux", "Darwin"]
                or "microsoft" in platform.uname().release.lower()
            ):
                # Unix: swap symlinks back
                temp_current = self.agents_dir / ".current.temp"

                if self.current_link.exists() or self.current_link.is_symlink():
                    self.current_link.rename(temp_current)

                old_current.rename(self.current_link)
                temp_current.unlink() if temp_current.is_symlink() else shutil.rmtree(
                    temp_current
                )
            else:
                # Windows: restore backup
                if self.current_link.exists():
                    shutil.rmtree(self.current_link)
                old_current.rename(self.current_link)

            print("   ✓ Rollback complete")
            return True

        except Exception as e:
            print(f"   ❌ Rollback failed: {e}")
            return False

    def cleanup_old_versions(self, keep: int = 5) -> None:
        """Remove old version directories keeping only 'keep' most recent."""
        if not self.versions_dir.exists():
            return

        versions = sorted(
            [d for d in self.versions_dir.iterdir() if d.is_dir()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )

        for old_version in versions[keep:]:
            print(f"   Cleaning up old version: {old_version.name}")
            shutil.rmtree(old_version)


if __name__ == "__main__":
    import tempfile

    # Test swap manager
    with tempfile.TemporaryDirectory() as tmpdir:
        agents_dir = Path(tmpdir) / ".agents"
        agents_dir.mkdir()

        # Create current version
        current = agents_dir / "current"
        current.mkdir()
        (current / "scripts").mkdir()
        (current / "scripts" / "test.py").write_text("v1")
        (current / "agents").write_text("#!/bin/bash")

        # Create new version
        versions = agents_dir / "versions"
        versions.mkdir()
        new_ver = versions / "v1.1.0"
        new_ver.mkdir()
        (new_ver / "scripts").mkdir()
        (new_ver / "scripts" / "test.py").write_text("v1.1")
        (new_ver / "agents").write_text("#!/bin/bash")

        # Test swap
        swapper = SwapManager(agents_dir)

        try:
            success = swapper.swap(new_ver)
            print(f"\nSwap successful: {success}")

            # Verify
            current_content = (
                agents_dir / "current" / "scripts" / "test.py"
            ).read_text()
            print(f"Current version content: {current_content}")

            # Test rollback
            swapper.rollback()

        except Exception as e:
            print(f"Error: {e}")
