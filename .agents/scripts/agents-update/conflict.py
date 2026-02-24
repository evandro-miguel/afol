#!/usr/bin/env python3
"""
Conflict detection and three-way merge for agentic system updates.
Implements three-way diff algorithm for detecting file changes.
"""

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, List, Optional
from pathlib import Path
import difflib

from manifest import Manifest, FileEntry
from ownership import OwnershipMap, OwnershipType


class ChangeType(Enum):
    """Types of changes in three-way merge."""

    UNCHANGED = auto()
    SAFE_UPDATE = auto()  # Base == Local, can update to upstream
    USER_MODIFIED = auto()  # Local changed, upstream unchanged
    CONFLICT = auto()  # Both local and upstream changed
    NEW_UPSTREAM = auto()  # Only in upstream
    DELETED_UPSTREAM = auto()  # Deleted upstream
    USER_ADDED = auto()  # Only in local, not in base


@dataclass
class FileChange:
    """Represents a change to a single file."""

    path: str
    change_type: ChangeType
    base_hash: Optional[str] = None
    local_hash: Optional[str] = None
    upstream_hash: Optional[str] = None
    diff: Optional[str] = None
    resolution: Optional[str] = None  # How to resolve (if applicable)

    def is_safe(self) -> bool:
        """Check if change is safe to apply."""
        return self.change_type in [
            ChangeType.UNCHANGED,
            ChangeType.SAFE_UPDATE,
            ChangeType.NEW_UPSTREAM,
        ]

    def requires_action(self) -> bool:
        """Check if change requires user action."""
        return self.change_type in [
            ChangeType.CONFLICT,
            ChangeType.USER_MODIFIED,
            ChangeType.DELETED_UPSTREAM,
        ]


@dataclass
class UpdatePlan:
    """Complete update plan with all changes."""

    current_version: str
    target_version: str
    changes: List[FileChange] = field(default_factory=list)

    def get_by_type(self, change_type: ChangeType) -> List[FileChange]:
        """Get all changes of a specific type."""
        return [c for c in self.changes if c.change_type == change_type]

    def get_safe_changes(self) -> List[FileChange]:
        """Get changes that are safe to apply."""
        return [c for c in self.changes if c.is_safe()]

    def get_action_required(self) -> List[FileChange]:
        """Get changes requiring user action."""
        return [c for c in self.changes if c.requires_action()]

    def has_conflicts(self) -> bool:
        """Check if plan has any conflicts."""
        return any(c.change_type == ChangeType.CONFLICT for c in self.changes)

    def get_stats(self) -> Dict[str, int]:
        """Get statistics of changes by type."""
        stats = {}
        for change_type in ChangeType:
            count = len(self.get_by_type(change_type))
            if count > 0:
                stats[change_type.name.lower()] = count
        return stats

    def get_summary(self) -> str:
        """Get human-readable summary."""
        stats = self.get_stats()
        lines = [
            f"Update {self.current_version} → {self.target_version}",
            f"Total changes: {len(self.changes)}",
        ]

        for change_type, count in stats.items():
            lines.append(f"  {change_type}: {count}")

        return "\n".join(lines)


class ConflictResolver:
    """Resolves conflicts using three-way merge."""

    def __init__(
        self,
        base_manifest: Manifest,
        local_manifest: Manifest,
        upstream_manifest: Manifest,
        ownership: OwnershipMap,
    ):
        self.base = base_manifest
        self.local = local_manifest
        self.upstream = upstream_manifest
        self.ownership = ownership

    def detect_changes(self) -> UpdatePlan:
        """
        Detect all changes between base, local, and upstream.

        Returns:
            UpdatePlan with all file changes
        """
        changes = []

        # Get all paths from all three manifests
        all_paths = (
            self.base.get_paths() | self.local.get_paths() | self.upstream.get_paths()
        )

        for path in all_paths:
            # Skip user-owned paths
            if not self.ownership.is_updatable(path):
                continue

            change = self._analyze_path(path)
            if change:
                changes.append(change)

        # Sort by change type (conflicts first)
        changes.sort(
            key=lambda c: (0 if c.change_type == ChangeType.CONFLICT else 1, c.path)
        )

        return UpdatePlan(
            current_version=self.local.version,
            target_version=self.upstream.version,
            changes=changes,
        )

    def _analyze_path(self, path: str) -> Optional[FileChange]:
        """Analyze a single path for changes."""
        in_base = self.base.has_file(path)
        in_local = self.local.has_file(path)
        in_upstream = self.upstream.has_file(path)

        base_hash = self.base.get_file_hash(path) if in_base else None
        local_hash = self.local.get_file_hash(path) if in_local else None
        upstream_hash = self.upstream.get_file_hash(path) if in_upstream else None

        # Determine change type
        if not in_base:
            # New file
            if in_local and not in_upstream:
                return FileChange(
                    path=path, change_type=ChangeType.USER_ADDED, local_hash=local_hash
                )
            elif in_upstream and not in_local:
                return FileChange(
                    path=path,
                    change_type=ChangeType.NEW_UPSTREAM,
                    upstream_hash=upstream_hash,
                )
            elif in_local and in_upstream:
                if local_hash == upstream_hash:
                    return FileChange(
                        path=path,
                        change_type=ChangeType.UNCHANGED,
                        local_hash=local_hash,
                        upstream_hash=upstream_hash,
                    )
                else:
                    # Both added different content - conflict
                    return FileChange(
                        path=path,
                        change_type=ChangeType.CONFLICT,
                        local_hash=local_hash,
                        upstream_hash=upstream_hash,
                    )

        elif not in_upstream:
            # Deleted upstream
            return FileChange(
                path=path,
                change_type=ChangeType.DELETED_UPSTREAM,
                base_hash=base_hash,
                local_hash=local_hash,
            )

        elif not in_local:
            # User deleted, upstream still has it
            return FileChange(
                path=path,
                change_type=ChangeType.SAFE_UPDATE,
                base_hash=base_hash,
                upstream_hash=upstream_hash,
            )

        else:
            # Exists in all three
            if local_hash == base_hash:
                if upstream_hash == base_hash:
                    return FileChange(
                        path=path,
                        change_type=ChangeType.UNCHANGED,
                        base_hash=base_hash,
                        local_hash=local_hash,
                        upstream_hash=upstream_hash,
                    )
                else:
                    return FileChange(
                        path=path,
                        change_type=ChangeType.SAFE_UPDATE,
                        base_hash=base_hash,
                        local_hash=local_hash,
                        upstream_hash=upstream_hash,
                    )
            else:
                # Local differs from base
                if upstream_hash == base_hash:
                    return FileChange(
                        path=path,
                        change_type=ChangeType.USER_MODIFIED,
                        base_hash=base_hash,
                        local_hash=local_hash,
                        upstream_hash=upstream_hash,
                    )
                elif local_hash == upstream_hash:
                    return FileChange(
                        path=path,
                        change_type=ChangeType.UNCHANGED,
                        base_hash=base_hash,
                        local_hash=local_hash,
                        upstream_hash=upstream_hash,
                    )
                else:
                    # True conflict
                    return FileChange(
                        path=path,
                        change_type=ChangeType.CONFLICT,
                        base_hash=base_hash,
                        local_hash=local_hash,
                        upstream_hash=upstream_hash,
                    )

        return None

    def generate_diff(
        self, change: FileChange, local_path: Path, upstream_path: Path
    ) -> str:
        """
        Generate diff for a file change.

        Args:
            change: FileChange to generate diff for
            local_path: Path to local file (if exists)
            upstream_path: Path to upstream file (if exists)

        Returns:
            Unified diff string
        """
        if change.change_type in [ChangeType.UNCHANGED, ChangeType.USER_ADDED]:
            return ""

        local_lines = []
        upstream_lines = []

        if local_path.exists():
            try:
                with open(local_path, "r", encoding="utf-8") as f:
                    local_lines = f.readlines()
            except (UnicodeDecodeError, IOError):
                return "[Binary file - diff not available]"

        if upstream_path.exists():
            try:
                with open(upstream_path, "r", encoding="utf-8") as f:
                    upstream_lines = f.readlines()
            except (UnicodeDecodeError, IOError):
                return "[Binary file - diff not available]"

        diff = difflib.unified_diff(
            local_lines,
            upstream_lines,
            fromfile=f"a/{change.path}",
            tofile=f"b/{change.path}",
            lineterm="",
        )

        return "\n".join(diff)

    def resolve_conflict(self, change: FileChange, strategy: str = "upstream") -> str:
        """
        Resolve a conflict using a strategy.

        Args:
            change: Conflict to resolve
            strategy: Resolution strategy (upstream, local, merge)

        Returns:
            Resolution description
        """
        if strategy == "upstream":
            change.resolution = "Accept upstream version"
            return change.resolution
        elif strategy == "local":
            change.resolution = "Keep local version"
            return change.resolution
        elif strategy == "backup":
            change.resolution = f"Backup as {change.path}.local.bak, use upstream"
            return change.resolution
        else:
            change.resolution = f"Unknown strategy: {strategy}"
            return change.resolution


def format_change_line(change: FileChange, width: int = 60) -> str:
    """Format a single change for display."""
    symbols = {
        ChangeType.UNCHANGED: " ",
        ChangeType.SAFE_UPDATE: "✓",
        ChangeType.USER_MODIFIED: "⚠",
        ChangeType.CONFLICT: "✗",
        ChangeType.NEW_UPSTREAM: "+",
        ChangeType.DELETED_UPSTREAM: "-",
        ChangeType.USER_ADDED: "•",
    }

    type_names = {
        ChangeType.UNCHANGED: "unchanged",
        ChangeType.SAFE_UPDATE: "update",
        ChangeType.USER_MODIFIED: "modified",
        ChangeType.CONFLICT: "CONFLICT",
        ChangeType.NEW_UPSTREAM: "new",
        ChangeType.DELETED_UPSTREAM: "deleted",
        ChangeType.USER_ADDED: "added",
    }

    symbol = symbols.get(change.change_type, "?")
    type_name = type_names.get(change.change_type, "unknown")

    # Truncate path if too long
    path = change.path
    if len(path) > width - 15:
        path = "..." + path[-(width - 18) :]

    return f"{symbol} {path:<{width - 12}} {type_name:>10}"


def print_update_plan(plan: UpdatePlan, show_unchanged: bool = False) -> None:
    """Print update plan in human-readable format."""
    print(plan.get_summary())
    print()

    for change in plan.changes:
        if not show_unchanged and change.change_type == ChangeType.UNCHANGED:
            continue

        print(format_change_line(change))

        if change.change_type == ChangeType.CONFLICT:
            if change.resolution:
                print(f"  → Resolution: {change.resolution}")
            else:
                print("  → Will backup local and use upstream")


if __name__ == "__main__":
    # Test conflict detection
    from manifest import Manifest, FileEntry

    # Create test manifests
    base = Manifest(version="1.0.0")
    base.add_file(FileEntry("scripts/test.py", "sha256:abc", 100, "2024-01-01"))
    base.add_file(FileEntry("docs/readme.md", "sha256:def", 200, "2024-01-01"))

    local = Manifest(version="1.0.0")
    local.add_file(
        FileEntry("scripts/test.py", "sha256:abc", 100, "2024-01-01")
    )  # Same
    local.add_file(
        FileEntry("docs/readme.md", "sha256:xyz", 200, "2024-01-02")
    )  # Modified
    local.add_file(
        FileEntry("local/file.txt", "sha256:local", 50, "2024-01-03")
    )  # User added

    upstream = Manifest(version="1.1.0")
    upstream.add_file(
        FileEntry("scripts/test.py", "sha256:abc", 100, "2024-01-01")
    )  # Same
    upstream.add_file(
        FileEntry("docs/readme.md", "sha256:new", 250, "2024-01-05")
    )  # Updated
    upstream.add_file(
        FileEntry("scripts/new.py", "sha256:newfile", 150, "2024-01-05")
    )  # New

    # Create ownership map that considers everything system
    from ownership import OwnershipMap, OwnershipRule, OwnershipType

    ownership = OwnershipMap(
        rules=[OwnershipRule(".", OwnershipType.SYSTEM, recursive=True)],
        default_policy=OwnershipType.SYSTEM,
    )

    resolver = ConflictResolver(base, local, upstream, ownership)
    plan = resolver.detect_changes()

    print_update_plan(plan)
