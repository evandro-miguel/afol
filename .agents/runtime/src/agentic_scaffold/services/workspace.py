from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import TypedDict

from agentic_scaffold.models import TreeNode, WorkspaceSummary

GENERATED_ROOT_NAMES = {
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
}
GENERATED_PATH_PREFIXES = {
    (".agents", "cache"),
    (".agents", "tmp"),
    (".agents", ".tmp"),
    (".agents", ".cache"),
    (".agents", "scripts", "agents_scripts.egg-info"),
    (".agents", "tools", "uv"),
    (".agents", "wb"),
}
GENERATED_FILE_PATHS = {
    (".agents", "data", "telemetry", "events.jsonl"),
}


class EntryCounters(TypedDict):
    files: int
    dirs: int
    seen: int
    truncated: bool


class WorkspaceInspector:
    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root

    def inspect(
        self,
        depth: int = 3,
        include_hidden: bool = False,
        include_generated: bool = False,
        max_entries: int = 500,
    ) -> WorkspaceSummary:
        counters: EntryCounters = {"files": 0, "dirs": 0, "seen": 0, "truncated": False}
        tree = self._build_tree(
            self.repo_root,
            depth,
            include_hidden=include_hidden,
            include_generated=include_generated,
            max_entries=max_entries,
            counters=counters,
        )

        return WorkspaceSummary(
            root=str(self.repo_root),
            max_depth=depth,
            file_count=counters["files"],
            dir_count=counters["dirs"],
            truncated=counters["truncated"],
            tree=tree,
        )

    def _build_tree(
        self,
        path: Path,
        remaining: int,
        *,
        include_hidden: bool,
        include_generated: bool,
        max_entries: int,
        counters: EntryCounters,
    ) -> list[TreeNode]:
        if remaining < 0 or self._entry_limit_reached(counters, max_entries):
            counters["truncated"] = True
            return []

        nodes: list[TreeNode] = []
        for entry in self._iter_sorted_entries(path):
            relative_path = entry.relative_to(self.repo_root)
            if self._should_skip_entry(
                entry,
                relative_path,
                include_hidden=include_hidden,
                include_generated=include_generated,
            ):
                continue
            if self._entry_limit_reached(counters, max_entries):
                counters["truncated"] = True
                break
            nodes.append(
                self._build_node(
                    entry,
                    relative_path,
                    remaining=remaining,
                    include_hidden=include_hidden,
                    include_generated=include_generated,
                    max_entries=max_entries,
                    counters=counters,
                )
            )
        return nodes

    def _build_node(
        self,
        entry: Path,
        relative_path: Path,
        *,
        remaining: int,
        include_hidden: bool,
        include_generated: bool,
        max_entries: int,
        counters: EntryCounters,
    ) -> TreeNode:
        counters["seen"] += 1
        node = self._create_node(entry, relative_path)
        if entry.is_dir():
            counters["dirs"] += 1
            node.children = self._build_tree(
                entry,
                remaining - 1,
                include_hidden=include_hidden,
                include_generated=include_generated,
                max_entries=max_entries,
                counters=counters,
            )
        else:
            counters["files"] += 1
        return node

    @staticmethod
    def _iter_sorted_entries(path: Path) -> list[Path]:
        try:
            return sorted(path.iterdir(), key=lambda entry: (entry.is_file(), entry.name.lower()))
        except OSError:
            return []

    def _should_skip_entry(
        self,
        entry: Path,
        relative_path: Path,
        *,
        include_hidden: bool,
        include_generated: bool,
    ) -> bool:
        is_generated = self._is_generated_path(relative_path)
        if is_generated and not include_generated:
            return True
        return (
            not include_hidden
            and entry.name.startswith(".")
            and entry.name not in {".agents", ".github"}
            and not is_generated
        )

    @staticmethod
    def _create_node(entry: Path, relative_path: Path) -> TreeNode:
        stat = entry.stat()
        is_dir = entry.is_dir()
        return TreeNode(
            path=relative_path.as_posix(),
            name=entry.name,
            kind="dir" if is_dir else "file",
            size_bytes=0 if is_dir else stat.st_size,
            modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        )

    @staticmethod
    def _entry_limit_reached(counters: EntryCounters, max_entries: int) -> bool:
        return counters["seen"] >= max_entries

    @staticmethod
    def _is_generated_path(relative_path: Path) -> bool:
        parts = relative_path.parts
        if not parts:
            return False
        if any(part in GENERATED_ROOT_NAMES for part in parts):
            return True
        if any(
            WorkspaceInspector._contains_subsequence(parts, prefix)
            for prefix in GENERATED_PATH_PREFIXES
        ):
            return True
        if any(
            WorkspaceInspector._contains_subsequence(parts, file_path)
            for file_path in GENERATED_FILE_PATHS
        ):
            return True
        return False

    @staticmethod
    def _contains_subsequence(parts: tuple[str, ...], sequence: tuple[str, ...]) -> bool:
        seq_len = len(sequence)
        if seq_len == 0 or len(parts) < seq_len:
            return False
        return any(
            parts[index : index + seq_len] == sequence for index in range(len(parts) - seq_len + 1)
        )
