#!/usr/bin/env python3
"""
Manifest management for agentic system updates.
Handles manifest.json generation, validation, and hash computation.
"""

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set
from datetime import datetime


@dataclass
class FileEntry:
    """Represents a file in the manifest."""

    path: str
    hash: str
    size: int
    modified: str  # ISO format timestamp

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "hash": self.hash,
            "size": self.size,
            "modified": self.modified,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "FileEntry":
        return cls(
            path=data["path"],
            hash=data["hash"],
            size=data["size"],
            modified=data["modified"],
        )


@dataclass
class Manifest:
    """System manifest containing version and file hashes."""

    version: str
    schema_version: int = 1
    upstream_commit: str = ""
    upstream_url: str = ""
    upstream_tag: str = ""
    generated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    files: Dict[str, FileEntry] = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert manifest to dictionary."""
        return {
            "version": self.version,
            "schema_version": self.schema_version,
            "upstream_commit": self.upstream_commit,
            "upstream_url": self.upstream_url,
            "upstream_tag": self.upstream_tag,
            "generated_at": self.generated_at,
            "files": {k: v.to_dict() for k, v in self.files.items()},
        }

    def to_json(self, indent: int = 2) -> str:
        """Convert manifest to JSON string."""
        return json.dumps(self.to_dict(), indent=indent, sort_keys=True)

    @classmethod
    def from_dict(cls, data: dict) -> "Manifest":
        """Create manifest from dictionary."""
        files = {k: FileEntry.from_dict(v) for k, v in data.get("files", {}).items()}
        return cls(
            version=data["version"],
            schema_version=data.get("schema_version", 1),
            upstream_commit=data.get("upstream_commit", ""),
            upstream_url=data.get("upstream_url", ""),
            upstream_tag=data.get("upstream_tag", ""),
            generated_at=data.get("generated_at", datetime.now().isoformat()),
            files=files,
        )

    @classmethod
    def from_json(cls, json_str: str) -> "Manifest":
        """Parse manifest from JSON string."""
        return cls.from_dict(json.loads(json_str))

    @classmethod
    def from_file(cls, path: Path) -> "Manifest":
        """Load manifest from file."""
        with open(path, "r", encoding="utf-8") as f:
            return cls.from_json(f.read())

    def save(self, path: Path) -> None:
        """Save manifest to file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(self.to_json())

    def get_file_hash(self, path: str) -> Optional[str]:
        """Get hash for a specific file."""
        entry = self.files.get(path)
        return entry.hash if entry else None

    def has_file(self, path: str) -> bool:
        """Check if a file is in the manifest."""
        return path in self.files

    def add_file(self, entry: FileEntry) -> None:
        """Add a file entry to the manifest."""
        self.files[entry.path] = entry

    def remove_file(self, path: str) -> bool:
        """Remove a file from the manifest. Returns True if existed."""
        return self.files.pop(path, None) is not None

    def get_paths(self) -> Set[str]:
        """Get all paths in the manifest."""
        return set(self.files.keys())


def compute_file_hash(filepath: Path, algorithm: str = "sha256") -> str:
    """Compute hash of a file."""
    hasher = hashlib.new(algorithm)
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hasher.update(chunk)
    return f"{algorithm}:{hasher.hexdigest()}"


def create_file_entry(filepath: Path, base_path: Path) -> FileEntry:
    """Create a FileEntry from a file path."""
    rel_path = filepath.relative_to(base_path).as_posix()
    stat = filepath.stat()

    return FileEntry(
        path=rel_path,
        hash=compute_file_hash(filepath),
        size=stat.st_size,
        modified=datetime.fromtimestamp(stat.st_mtime).isoformat(),
    )


def generate_manifest(
    directory: Path,
    version: str,
    upstream_commit: str = "",
    upstream_url: str = "",
    upstream_tag: str = "",
    include_patterns: Optional[List[str]] = None,
    exclude_patterns: Optional[List[str]] = None,
) -> Manifest:
    """
    Generate a manifest from a directory.

    Args:
        directory: Root directory to scan
        version: Version string
        upstream_commit: Git commit hash from upstream
        upstream_url: Upstream repository URL
        upstream_tag: Upstream tag/release
        include_patterns: Glob patterns to include (default: all)
        exclude_patterns: Glob patterns to exclude

    Returns:
        Manifest object
    """
    manifest = Manifest(
        version=version,
        upstream_commit=upstream_commit,
        upstream_url=upstream_url,
        upstream_tag=upstream_tag,
    )

    exclude_patterns = exclude_patterns or [
        "*.pyc",
        "__pycache__/*",
        "*.pyo",
        ".git/*",
        ".venv/*",
        ".cache/*",
        "versions/*",
        "z-arq/*",
        "wb/*",
    ]

    for filepath in directory.rglob("*"):
        if not filepath.is_file():
            continue

        rel_path = filepath.relative_to(directory).as_posix()

        # Check excludes
        skip = False
        for pattern in exclude_patterns:
            if filepath.match(pattern) or rel_path.startswith(pattern.rstrip("/*")):
                skip = True
                break

        if skip:
            continue

        # Check includes (if specified)
        if include_patterns:
            matched = any(
                filepath.match(p) or rel_path.startswith(p.rstrip("/*"))
                for p in include_patterns
            )
            if not matched:
                continue

        entry = create_file_entry(filepath, directory)
        manifest.add_file(entry)

    return manifest


def compare_manifests(
    base: Manifest, local: Manifest, upstream: Manifest
) -> Dict[str, List[str]]:
    """
    Compare three manifests and categorize differences.

    Returns dict with categories:
    - unchanged: same in all three
    - safe_update: base == local, can update to upstream
    - user_modified: local changed from base, upstream unchanged
    - conflict: both local and upstream changed from base
    - new_upstream: only in upstream
    - deleted_upstream: in base, not in upstream
    - user_added: only in local, not in base
    """
    base_paths = base.get_paths()
    local_paths = local.get_paths()
    upstream_paths = upstream.get_paths()

    result = {
        "unchanged": [],
        "safe_update": [],
        "user_modified": [],
        "conflict": [],
        "new_upstream": [],
        "deleted_upstream": [],
        "user_added": [],
    }

    all_paths = base_paths | local_paths | upstream_paths

    for path in all_paths:
        in_base = path in base_paths
        in_local = path in local_paths
        in_upstream = path in upstream_paths

        base_hash = base.get_file_hash(path) if in_base else None
        local_hash = local.get_file_hash(path) if in_local else None
        upstream_hash = upstream.get_file_hash(path) if in_upstream else None

        # Determine category
        if not in_base:
            # New file
            if in_local and not in_upstream:
                result["user_added"].append(path)
            elif in_upstream and not in_local:
                result["new_upstream"].append(path)
            elif in_local and in_upstream:
                if local_hash == upstream_hash:
                    result["unchanged"].append(path)
                else:
                    # Edge case: both added different content
                    result["conflict"].append(path)
        elif not in_upstream:
            # Deleted upstream
            result["deleted_upstream"].append(path)
        elif not in_local:
            # Exists in base and upstream, but not locally
            # Could be user deleted
            result["safe_update"].append(path)
        else:
            # Exists in all three
            if local_hash == base_hash:
                if upstream_hash == base_hash:
                    result["unchanged"].append(path)
                else:
                    result["safe_update"].append(path)
            else:
                # Local differs from base
                if upstream_hash == base_hash:
                    result["user_modified"].append(path)
                elif local_hash == upstream_hash:
                    result["unchanged"].append(path)
                else:
                    result["conflict"].append(path)

    return result


if __name__ == "__main__":
    # Simple test
    test_dir = Path(".")
    manifest = generate_manifest(
        test_dir,
        version="1.0.0",
        upstream_commit="abc123",
        upstream_url="https://github.com/user/repo",
    )
    print(f"Generated manifest with {len(manifest.files)} files")
    print(f"Version: {manifest.version}")
    print(f"Commit: {manifest.upstream_commit}")
