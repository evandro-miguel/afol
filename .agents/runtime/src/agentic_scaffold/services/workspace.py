from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

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
        counters = {"files": 0, "dirs": 0, "seen": 0, "truncated": False}

        def build_tree(path: Path, remaining: int) -> list[TreeNode]:
            if remaining < 0 or counters["seen"] >= max_entries:
                counters["truncated"] = True
                return []

            nodes: list[TreeNode] = []
            try:
                entries = sorted(
                    path.iterdir(), key=lambda entry: (entry.is_file(), entry.name.lower())
                )
            except PermissionError:
                return []

            for entry in entries:
                relative_path = entry.relative_to(self.repo_root)
                is_generated = self._is_generated_path(relative_path)
                if is_generated and not include_generated:
                    continue
                if (
                    not include_hidden
                    and entry.name.startswith(".")
                    and entry.name not in {".agents", ".github"}
                    and not is_generated
                ):
                    continue
                if counters["seen"] >= max_entries:
                    counters["truncated"] = True
                    break
                counters["seen"] += 1
                stat = entry.stat()
                node = TreeNode(
                    path=relative_path.as_posix(),
                    name=entry.name,
                    kind="dir" if entry.is_dir() else "file",
                    size_bytes=0 if entry.is_dir() else stat.st_size,
                    modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                )
                if entry.is_dir():
                    counters["dirs"] += 1
                    node.children = build_tree(entry, remaining - 1)
                else:
                    counters["files"] += 1
                nodes.append(node)
            return nodes

        tree = build_tree(self.repo_root, depth)
        return WorkspaceSummary(
            root=str(self.repo_root),
            max_depth=depth,
            file_count=counters["files"],
            dir_count=counters["dirs"],
            truncated=counters["truncated"],
            tree=tree,
        )

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
