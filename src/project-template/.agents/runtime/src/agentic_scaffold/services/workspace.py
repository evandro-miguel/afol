from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from agentic_scaffold.models import TreeNode, WorkspaceSummary


class WorkspaceInspector:
    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root

    def inspect(
        self, depth: int = 3, include_hidden: bool = False, max_entries: int = 500
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
                if (
                    not include_hidden
                    and entry.name.startswith(".")
                    and entry.name not in {".agents", ".github"}
                ):
                    continue
                if counters["seen"] >= max_entries:
                    counters["truncated"] = True
                    break
                counters["seen"] += 1
                stat = entry.stat()
                node = TreeNode(
                    path=entry.relative_to(self.repo_root).as_posix(),
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
