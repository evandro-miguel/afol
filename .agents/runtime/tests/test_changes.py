from __future__ import annotations

from pathlib import Path

from agentic_scaffold.runtime import AgenticRuntime
from agentic_scaffold.services.changes import UnsafePathError


def test_write_and_undo(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    target = scaffold_repo / "docs" / "agentic" / "new-note.md"

    result = runtime.changes.write_text_file(
        relative_path="docs/agentic/new-note.md",
        content="# New note\n",
        reason="create note",
    )
    assert result.path == "docs/agentic/new-note.md"
    assert target.exists()

    undo = runtime.undo_last_change()
    assert undo.ok is True
    assert not target.exists()



def test_archive_and_undo(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    stale = scaffold_repo / "docs" / "map" / "old.md"
    stale.write_text("old\n", encoding="utf-8")

    result = runtime.changes.archive_paths(["docs/map/old.md"], slug="stale-docs", reason="cleanup")
    assert result.moved == ["docs/map/old.md"]
    assert not stale.exists()

    undo = runtime.undo_last_change()
    assert undo.ok is True
    assert stale.exists()


def test_archive_rejects_unsafe_slug(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    stale = scaffold_repo / "docs" / "map" / "old.md"
    stale.write_text("old\n", encoding="utf-8")

    try:
        runtime.changes.archive_paths(["docs/map/old.md"], slug="../escape", reason="cleanup")
    except ValueError as exc:
        assert "slug must use only" in str(exc)
    else:
        raise AssertionError("unsafe archive slug was accepted")

    assert stale.exists()
    assert not any((scaffold_repo / ".agents" / "z-arq").iterdir())


def test_archive_validates_all_paths_before_moving(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    stale = scaffold_repo / "docs" / "map" / "old.md"
    stale.write_text("old\n", encoding="utf-8")

    try:
        runtime.changes.archive_paths(
            ["docs/map/old.md", "docs/map/missing.md"],
            slug="stale-docs",
            reason="cleanup",
        )
    except FileNotFoundError as exc:
        assert str(exc) == "docs/map/missing.md"
    else:
        raise AssertionError("archive accepted a missing path")

    assert stale.exists()
    assert not any((scaffold_repo / ".agents" / "z-arq").iterdir())


def test_write_rejects_paths_outside_repo(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)

    try:
        runtime.changes.write_text_file("../repo-evil/pwn.md", "bad\n", reason="escape")
    except UnsafePathError as exc:
        assert "outside the repository" in str(exc)
    else:
        raise AssertionError("outside repository path was accepted")

    assert not (scaffold_repo.parent / "repo-evil" / "pwn.md").exists()



def test_apply_unified_diff_and_undo(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    target = scaffold_repo / "docs" / "agentic" / "agents-mcp.md"
    original = target.read_text(encoding="utf-8")
    unified = """--- docs/agentic/agents-mcp.md
+++ docs/agentic/agents-mcp.md
@@ -6 +6 @@
-Useful guide
+Useful guide updated
"""
    result = runtime.changes.apply_unified_diff(
        relative_path="docs/agentic/agents-mcp.md",
        diff_text=unified,
        reason="update guide",
    )
    assert result.path == "docs/agentic/agents-mcp.md"
    assert "updated" in target.read_text(encoding="utf-8")

    undo = runtime.undo_last_change()
    assert undo.ok is True
    assert target.read_text(encoding="utf-8") == original
