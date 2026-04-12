from __future__ import annotations

from agentic_scaffold.runtime import AgenticRuntime


def test_generate_manifest(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    manifest = runtime.generate_manifest()

    assert manifest.docs_markdown_files >= 5
    assert manifest.script_files >= 1
    assert manifest.skill_count == 1
    assert manifest.runtime_docs["AGENTS.md"] is True
    assert manifest.tool_catalog_count == 1


def test_search_docs_finds_roadmap(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    response = runtime.search.search("roadmap", limit=5)

    assert response.hits
    assert any("knowledge/INDEX.md" in hit.path or "GENERAL-ROADMAP.md" in hit.path for hit in response.hits)


def test_validate_structure_ok(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    report = runtime.validator.validate(auto_fix=False)

    assert report.ok is True
    assert report.error_count == 0
