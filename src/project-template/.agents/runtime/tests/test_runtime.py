from __future__ import annotations

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
        "OPENCODE.md",
        "QWEN.md",
        "CLAUDE.md",
        "GEMINI.md",
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
