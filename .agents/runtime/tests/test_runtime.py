from __future__ import annotations

import pytest

from agentic_scaffold.config import find_repo_root
from agentic_scaffold.runtime import AgenticRuntime


def test_runtime_config_uses_shared_surface_contract(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)

    assert [path.relative_to(scaffold_repo).as_posix() for path in runtime.config.search_roots] == [
        "docs",
        "docs/knowledge",
        "docs/map",
        "docs/arc",
        "docs/agentic",
        ".agents/wb",
        ".agents/skills",
    ]
    assert runtime.config.runtime_docs == (
        "AGENTS.md",
        "CLAUDE.md",
    )
    assert runtime.config.manifest_major_surfaces == (
        "docs/",
        "docs/arc/",
        "docs/map/",
        ".agents/scripts/",
        ".agents/skills/",
        ".agents/wb/",
        ".agents/runtime/",
    )


def test_generate_manifest(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    manifest = runtime.generate_manifest()

    assert manifest.docs_markdown_files >= 5
    assert manifest.script_files >= 1
    assert manifest.skill_count == 1
    assert manifest.runtime_docs["AGENTS.md"] is True
    assert manifest.tool_catalog_count == 1
    assert manifest.major_surfaces == list(runtime.config.manifest_major_surfaces)
    assert manifest.search_roots == [path.relative_to(scaffold_repo).as_posix() for path in runtime.config.search_roots]


def test_search_docs_finds_roadmap(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    response = runtime.search.search("roadmap", limit=5)

    assert response.hits
    assert any("knowledge/INDEX.md" in hit.path or "GENERAL-ROADMAP.md" in hit.path for hit in response.hits)


def test_tool_catalog_resource_handles_corrupt_json(scaffold_repo):
    tool_catalog = scaffold_repo / ".agents" / "tools.json"
    tool_catalog.write_text("{bad-json", encoding="utf-8")
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)

    catalog = runtime.tool_catalog_resource()
    assert catalog["available"] is False
    assert catalog["tools"] == []


def test_search_tracks_total_candidates(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    response = runtime.search.search("unlikely-term-xyzw", limit=3)

    assert response.total_candidates > 0
    assert response.hits == []


def test_find_repo_root_prefers_explicit_env(scaffold_repo, tmp_path, monkeypatch):
    fake_repo = tmp_path / "alternate_repo"
    fake_repo.mkdir(parents=True, exist_ok=True)
    (fake_repo / "AGENTS.md").write_text("# AGENTS\n", encoding="utf-8")
    (fake_repo / ".agents").mkdir()

    monkeypatch.setenv("AGENTIC_REPO_ROOT", str(fake_repo))
    assert find_repo_root(fake_repo / "nested" / "dir") == fake_repo


def test_find_repo_root_rejects_invalid_env_root(scaffold_repo, tmp_path, monkeypatch):
    invalid = tmp_path / "not-a-repo"
    monkeypatch.setenv("AGENTIC_REPO_ROOT", str(invalid))

    with pytest.raises(FileNotFoundError, match="AGENTIC_REPO_ROOT"):
        find_repo_root(scaffold_repo / "docs")


def test_validate_structure_ok(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    report = runtime.validator.validate(auto_fix=False)

    assert report.ok is True
    assert report.error_count == 0


def test_command_registry_resource_includes_help_manifest(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    registry = runtime.command_registry_resource()
    help_manifest = runtime.registry.help_manifest()

    assert registry["available"] is True
    commands = {item["name"]: item for item in registry["commands"]}
    assert commands["wb"]["alias_of"] == "wb-update"

    help_commands = {item["name"]: item for item in help_manifest}
    assert help_commands["wb-update"]["aliases"] == ["wb"]


def test_adoption_inspection_detects_missing_overlay_surfaces(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    inspection = runtime.adoption.inspect()

    assert inspection.repo_root == str(scaffold_repo)
    assert inspection.has_justfile is False
    assert inspection.has_runtime_wrapper is False
    assert inspection.has_mcp_wrapper is False
    assert inspection.has_skills_manifest is False
    assert inspection.has_docs_map is True


def test_adoption_plan_classifies_overlay_actions(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    plan = runtime.adoption.plan()

    kinds = [action.kind for action in plan.actions]
    assert "create" in kinds
    assert "add-wrapper" in kinds
    assert "reconcile-skills" in kinds
    assert "benchmark" in kinds
    assert "rollback-record" in kinds
    assert plan.summary
