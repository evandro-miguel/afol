from __future__ import annotations

import json
from pathlib import Path

import pytest

from agentic_scaffold.runtime import AgenticRuntime
from agentic_scaffold.services.changes import UnsafePathError
from agentic_scaffold.services.journal import JournalStore


def test_journal_change_id_falls_back_when_randomness_is_blocked(scaffold_repo: Path, monkeypatch):
    import agentic_scaffold.services.journal as journal_module

    def blocked_uuid4():
        raise NotImplementedError("randomness blocked")

    monkeypatch.setattr(journal_module, "uuid4", blocked_uuid4)

    journal = JournalStore(scaffold_repo / ".agents" / "runtime-journal")
    first = journal.next_change_id()
    second = journal.next_change_id()

    assert first.startswith("chg_")
    assert second.startswith("chg_")
    assert first != second


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


def test_write_records_mutation_policy_metadata(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    (scaffold_repo / ".agents" / "wb" / ".active_session").write_text("session-a\n", encoding="utf-8")

    runtime.changes.write_text_file(
        relative_path="docs/agentic/new-note.md",
        content="# New note\n",
        reason="create note",
    )
    change_file = runtime.journal.latest_change_file()
    assert change_file is not None
    document = json.loads(change_file.read_text(encoding="utf-8"))
    payload = document["payload"]

    assert payload["mutation_id"] == document["record"]["change_id"]
    assert payload["mutation_action"] == "write_text"
    assert payload["command"].startswith("write_text_file")
    assert payload["dry_run"] is False
    assert payload["context"]["session_id"] == "session-a"
    assert payload["before"]["target"]["exists"] is False
    assert payload["after"]["target"]["exists"] is True
    assert "backup" in payload



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


def test_write_rejects_blocklisted_path(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)

    try:
        runtime.changes.write_text_file(".git/config", "bad\n", reason="escape")
    except UnsafePathError as exc:
        assert "path is blocked" in str(exc)
    else:
        raise AssertionError("blocklisted path was accepted")


def test_write_rejects_paths_outside_repo(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)

    try:
        runtime.changes.write_text_file("../repo-evil/pwn.md", "bad\n", reason="escape")
    except UnsafePathError as exc:
        assert "outside the repository" in str(exc)
    else:
        raise AssertionError("outside repository path was accepted")

    assert not (scaffold_repo.parent / "repo-evil" / "pwn.md").exists()


def test_move_and_undo(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    source = scaffold_repo / "docs" / "agentic" / "move-me.md"
    destination = scaffold_repo / "docs" / "map" / "moved.md"
    source.write_text("hello\n", encoding="utf-8")

    result = runtime.changes.move_path(
        source_relative_path="docs/agentic/move-me.md",
        dest_relative_path="docs/map/moved.md",
        reason="reorganize",
    )
    assert result.path == "docs/map/moved.md"
    assert not source.exists()
    assert destination.exists()
    change_file = runtime.journal.latest_change_file()
    assert change_file is not None
    document = json.loads(change_file.read_text(encoding="utf-8"))
    assert document["record"]["action"] == "move"
    assert document["payload"]["mutation_action"] == "move"

    undo = runtime.undo_last_change()
    assert undo.ok is True
    assert source.exists()
    assert not destination.exists()


def test_dry_run_write_does_not_write_or_journal(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    target = scaffold_repo / "docs" / "agentic" / "dry-run.md"
    before_entries = runtime.journal.list_change_files()

    plan = runtime.changes.write_text_file(
        relative_path="docs/agentic/dry-run.md",
        content="planned\n",
        reason="plan only",
        dry_run=True,
    )
    assert isinstance(plan, dict)
    assert plan["dry_run"] is True
    assert plan["mutation_action"] == "write_text"
    assert not target.exists()
    assert runtime.journal.list_change_files() == before_entries


def test_dry_run_archive_does_not_move_files(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    stale = scaffold_repo / "docs" / "map" / "old.md"
    stale.write_text("old\n", encoding="utf-8")
    before_entries = runtime.journal.list_change_files()

    plan = runtime.changes.archive_paths(
        ["docs/map/old.md"],
        slug="stale-docs",
        reason="cleanup",
        dry_run=True,
    )
    assert isinstance(plan, dict)
    assert plan["dry_run"] is True
    assert plan["mutation_action"] == "archive"
    assert stale.exists()
    assert runtime.journal.list_change_files() == before_entries
    assert not any((scaffold_repo / ".agents" / "z-arq").iterdir())


def test_undo_rejects_tampered_write_target_outside_repo(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    target = scaffold_repo / "docs" / "agentic" / "new-note.md"

    runtime.changes.write_text_file("docs/agentic/new-note.md", "# New note\n", reason="create note")
    change_file = runtime.journal.latest_change_file()
    assert change_file is not None

    document = json.loads(change_file.read_text(encoding="utf-8"))
    document["payload"]["target_path"] = "../outside/pwn.md"
    change_file.write_text(json.dumps(document), encoding="utf-8")

    try:
        runtime.undo_last_change()
    except ValueError as exc:
        assert "outside the repository" in str(exc)
    else:
        raise AssertionError("undo accepted a tampered path outside the repository")

    assert target.exists()
    assert not (scaffold_repo.parent / "outside" / "pwn.md").exists()


def test_undo_rejects_tampered_backup_path_outside_journal(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    target = scaffold_repo / "docs" / "agentic" / "existing-note.md"
    target.write_text("old\n", encoding="utf-8")

    runtime.changes.write_text_file("docs/agentic/existing-note.md", "new\n", reason="update note")
    change_file = runtime.journal.latest_change_file()
    assert change_file is not None

    document = json.loads(change_file.read_text(encoding="utf-8"))
    document["payload"]["backup_path"] = "../outside-backup"
    change_file.write_text(json.dumps(document), encoding="utf-8")

    try:
        runtime.undo_last_change()
    except ValueError as exc:
        assert "backup path does not match expected backup target" in str(exc)
    else:
        raise AssertionError("undo accepted a tampered backup path outside the journal")

    assert target.read_text(encoding="utf-8") == "new\n"


def test_undo_rejects_tampered_archive_destination_outside_repo(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    stale = scaffold_repo / "docs" / "map" / "old.md"
    stale.write_text("old\n", encoding="utf-8")

    runtime.changes.archive_paths(["docs/map/old.md"], slug="stale-docs", reason="cleanup")
    change_file = runtime.journal.latest_change_file()
    assert change_file is not None

    document = json.loads(change_file.read_text(encoding="utf-8"))
    document["payload"]["moves"][0]["original_path"] = "../outside/restored.md"
    change_file.write_text(json.dumps(document), encoding="utf-8")

    try:
        runtime.undo_last_change()
    except ValueError as exc:
        assert "outside the repository" in str(exc)
    else:
        raise AssertionError("undo accepted a tampered archive destination outside the repository")

    assert not (scaffold_repo.parent / "outside" / "restored.md").exists()


def test_undo_rejects_tampered_move_destination_outside_repo(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    source = scaffold_repo / "docs" / "agentic" / "move-me.md"
    destination = scaffold_repo / "docs" / "map" / "moved.md"
    source.write_text("hello\n", encoding="utf-8")

    runtime.changes.move_path("docs/agentic/move-me.md", "docs/map/moved.md", reason="move")
    change_file = runtime.journal.latest_change_file()
    assert change_file is not None

    document = json.loads(change_file.read_text(encoding="utf-8"))
    document["payload"]["destination_path"] = "../outside/moved.md"
    change_file.write_text(json.dumps(document), encoding="utf-8")

    try:
        runtime.undo_last_change()
    except ValueError as exc:
        assert "outside the repository" in str(exc)
    else:
        raise AssertionError("undo accepted tampered move destination outside repository")

    assert destination.exists()
    assert not (scaffold_repo.parent / "outside" / "moved.md").exists()


def test_undo_rejects_tampered_move_patch_mismatch_before_filesystem_change(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    source = scaffold_repo / "docs" / "agentic" / "move-me.md"
    destination = scaffold_repo / "docs" / "map" / "moved.md"
    forged_source = scaffold_repo / "docs" / "agentic" / "forged-target.md"
    forged_destination = scaffold_repo / "docs" / "map" / "forged-origin.md"
    source.write_text("hello\n", encoding="utf-8")
    forged_source.write_text("keep-source\n", encoding="utf-8")
    forged_destination.write_text("keep-destination\n", encoding="utf-8")

    runtime.changes.move_path("docs/agentic/move-me.md", "docs/map/moved.md", reason="move")
    change_file = runtime.journal.latest_change_file()
    assert change_file is not None

    document = json.loads(change_file.read_text(encoding="utf-8"))
    document["record"]["action"] = "patch"
    document["payload"]["mutation_action"] = "move"
    document["payload"]["source_path"] = "docs/agentic/forged-target.md"
    document["payload"]["destination_path"] = "docs/map/forged-origin.md"
    change_file.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(ValueError, match="action mismatch"):
        runtime.undo_last_change()

    assert not source.exists()
    assert destination.exists()
    assert forged_source.read_text(encoding="utf-8") == "keep-source\n"
    assert forged_destination.read_text(encoding="utf-8") == "keep-destination\n"


def test_undo_rejects_tampered_backup_swap_before_restore(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    note_a = scaffold_repo / "docs" / "agentic" / "note-a.md"
    note_b = scaffold_repo / "docs" / "agentic" / "note-b.md"
    note_a.write_text("old-a\n", encoding="utf-8")
    note_b.write_text("old-b\n", encoding="utf-8")

    runtime.changes.write_text_file("docs/agentic/note-a.md", "new-a\n", reason="update a")
    runtime.changes.write_text_file("docs/agentic/note-b.md", "new-b\n", reason="update b")
    change_files = runtime.journal.list_change_files()
    assert len(change_files) == 2
    latest_change = change_files[-1]
    other_change = change_files[0]
    latest_document = json.loads(latest_change.read_text(encoding="utf-8"))
    other_document = json.loads(other_change.read_text(encoding="utf-8"))

    latest_document["payload"]["backup_path"] = other_document["payload"]["backup_path"]
    latest_change.write_text(json.dumps(latest_document), encoding="utf-8")

    with pytest.raises(ValueError, match="backup path does not match expected backup target"):
        runtime.undo_last_change()

    assert note_a.read_text(encoding="utf-8") == "new-a\n"
    assert note_b.read_text(encoding="utf-8") == "new-b\n"


@pytest.mark.parametrize(
    ("protected_relative", "original"),
    [
        (".git/config", "[core]\nrepositoryformatversion = 0\n"),
        (".agents/wb/.active_session", "260528_1145_f08-safe-file-mutation-undo\n"),
    ],
)
def test_undo_rejects_tampered_write_target_to_protected_paths(
    scaffold_repo: Path, protected_relative: str, original: str
):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    protected = scaffold_repo / protected_relative
    protected.parent.mkdir(parents=True, exist_ok=True)
    protected.write_text(original, encoding="utf-8")

    target = scaffold_repo / "docs" / "agentic" / "new-note.md"
    runtime.changes.write_text_file("docs/agentic/new-note.md", "# New note\n", reason="create note")
    change_file = runtime.journal.latest_change_file()
    assert change_file is not None

    document = json.loads(change_file.read_text(encoding="utf-8"))
    document["payload"]["target_path"] = protected_relative
    document["payload"]["backup_path"] = ""
    document["payload"]["existed_before"] = False
    change_file.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(ValueError, match="journal path is blocked"):
        runtime.undo_last_change()

    assert protected.read_text(encoding="utf-8") == original
    assert target.exists()


def test_undo_rejects_legacy_move_entry_missing_mutation_action(scaffold_repo: Path):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    source = scaffold_repo / "docs" / "agentic" / "move-me.md"
    source.write_text("hello\n", encoding="utf-8")

    runtime.changes.move_path("docs/agentic/move-me.md", "docs/map/moved.md", reason="move")
    change_file = runtime.journal.latest_change_file()
    assert change_file is not None

    document = json.loads(change_file.read_text(encoding="utf-8"))
    document["record"]["action"] = "patch"
    document["payload"].pop("mutation_action", None)
    change_file.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(ValueError, match="move entry missing mutation_action"):
        runtime.undo_last_change()

    assert (scaffold_repo / "docs" / "map" / "moved.md").exists()



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
