from __future__ import annotations

import pytest

from agentic_scaffold.config import find_repo_root
from agentic_scaffold.runtime import AgenticRuntime


def _tree_paths(tree: list[dict] | list[object]) -> set[str]:
    paths: set[str] = set()

    def visit(nodes: list[object]) -> None:
        for node in nodes:
            path = getattr(node, "path", None)
            if isinstance(path, str):
                paths.add(path)
            children = getattr(node, "children", None)
            if isinstance(children, list) and children:
                visit(children)

    visit(list(tree))
    return paths


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


def test_search_docs_ignores_malformed_frontmatter(scaffold_repo):
    broken_doc = scaffold_repo / "docs" / "knowledge" / "BROKEN-FRONTMATTER.md"
    broken_doc.write_text(
        "---\ntitle: [unterminated\n---\n# Broken Metadata\nmalformed frontmatter search sentinel\n",
        encoding="utf-8",
    )
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)

    response = runtime.search.search("malformed frontmatter sentinel", limit=5)

    assert any(hit.path == "docs/knowledge/BROKEN-FRONTMATTER.md" for hit in response.hits)


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
    assert commands["benchmark"]["script_name"] == "agents-benchmark.py"
    assert commands["scaffold-update"]["script_name"] == "agents-scaffold-update.py"
    assert commands["wb"]["alias_of"] == "wb-update"

    help_commands = {item["name"]: item for item in help_manifest}
    assert "benchmark" in help_commands
    assert "scaffold-update" in help_commands
    assert help_commands["wb-update"]["aliases"] == ["wb"]


def test_runtime_action_spec_source_of_truth(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    specs = {spec.action_id: spec for spec in runtime.action_specs()}
    assert specs["inspect"].cli_command == "inspect"
    assert specs["inspect"].mcp_tool == "inspect_workspace"
    assert specs["health"].cli_command == "health"
    assert specs["health"].mcp_tool == "runtime_health"
    assert runtime.action_spec_for_cli_command("inspect") == specs["inspect"]
    assert runtime.action_spec_for_mcp_tool("runtime_health") == specs["health"]


def test_run_action_inspect_valid_and_invalid(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    positive = runtime.run_action("inspect", depth=2, max_entries=10)
    assert positive.status == "ok"
    payload = positive.payload
    assert isinstance(payload, dict)
    assert payload["max_depth"] == 2

    invalid = runtime.run_action("inspect", depth=99)
    assert invalid.status == "error"
    assert invalid.message == "depth must be between 0 and 10"


def test_runtime_health_action_returns_minimal_checks(scaffold_repo):
    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    health = runtime.run_action("health")

    assert health.status == "ok"
    assert isinstance(health.payload, dict)
    assert health.payload["status"] == "healthy"
    assert health.payload["checks"]["repo_root"]["exists"] is True
    assert health.payload["checks"]["repo_root"]["label"] == scaffold_repo.name
    assert "command_registry" in health.payload["checks"]
    assert "required_available" in health.payload["checks"]["command_registry"]
    assert health.payload["checks"]["search_roots"]["count"] >= 1
    assert str(scaffold_repo) not in str(health.payload)


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


def test_workspace_inspect_generated_and_hidden_filters(scaffold_repo):
    (scaffold_repo / ".git").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".git" / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
    (scaffold_repo / ".venv" / "bin").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".venv" / "bin" / "python").write_text("#!/usr/bin/env python\n", encoding="utf-8")
    (scaffold_repo / ".pytest_cache").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".pytest_cache" / "state").write_text("ok\n", encoding="utf-8")
    (scaffold_repo / ".ruff_cache").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".ruff_cache" / "state").write_text("ok\n", encoding="utf-8")
    (scaffold_repo / "__pycache__").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / "__pycache__" / "runtime.pyc").write_text("bytecode\n", encoding="utf-8")
    (scaffold_repo / "node_modules" / "pkg").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / "node_modules" / "pkg" / "index.js").write_text("export const x = 1;\n", encoding="utf-8")
    (scaffold_repo / ".agents" / "cache").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".agents" / "cache" / "snapshot.json").write_text("{}", encoding="utf-8")
    (scaffold_repo / ".agents" / "tmp").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".agents" / "tmp" / "work.txt").write_text("temp\n", encoding="utf-8")
    (scaffold_repo / ".agents" / ".tmp").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".agents" / ".tmp" / "work.txt").write_text("temp\n", encoding="utf-8")
    (scaffold_repo / ".agents" / ".cache").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".agents" / ".cache" / "index.json").write_text("{}", encoding="utf-8")
    (scaffold_repo / ".agents" / "scripts" / "agents_scripts.egg-info").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".agents" / "scripts" / "agents_scripts.egg-info" / "PKG-INFO").write_text(
        "name: agents-scripts\n", encoding="utf-8"
    )
    (scaffold_repo / ".agents" / "tools" / "uv").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".agents" / "tools" / "uv" / "state.txt").write_text("ok\n", encoding="utf-8")
    (scaffold_repo / ".agents" / "data" / "telemetry").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".agents" / "data" / "telemetry" / "events.jsonl").write_text("{}", encoding="utf-8")
    (scaffold_repo / ".agents" / "wb" / "260101_test").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".agents" / "wb" / "260101_test" / "task.md").write_text("# task\n", encoding="utf-8")
    (scaffold_repo / ".hidden-keep").mkdir(parents=True, exist_ok=True)
    (scaffold_repo / ".hidden-keep" / "note.md").write_text("# keep\n", encoding="utf-8")
    (scaffold_repo / "docs" / "keep.md").write_text("# keep\n", encoding="utf-8")

    runtime = AgenticRuntime.from_repo_root(scaffold_repo)
    noisy_prefixes = (
        ".git",
        ".venv",
        ".pytest_cache",
        ".ruff_cache",
        "__pycache__",
        "node_modules",
        ".agents/cache",
        ".agents/tmp",
        ".agents/.tmp",
        ".agents/.cache",
        ".agents/scripts/agents_scripts.egg-info",
        ".agents/tools/uv",
        ".agents/wb",
        ".agents/data/telemetry/events.jsonl",
    )

    def includes_noisy(paths: set[str]) -> bool:
        return any(path == prefix or path.startswith(f"{prefix}/") for path in paths for prefix in noisy_prefixes)

    default_summary = runtime.workspace.inspect(depth=6, max_entries=2000)
    default_paths = _tree_paths(default_summary.tree)
    assert "docs/keep.md" in default_paths
    assert ".hidden-keep/note.md" not in default_paths
    assert includes_noisy(default_paths) is False

    with_hidden = runtime.workspace.inspect(depth=6, include_hidden=True, max_entries=2000)
    hidden_paths = _tree_paths(with_hidden.tree)
    assert ".hidden-keep/note.md" in hidden_paths
    assert includes_noisy(hidden_paths) is False

    with_generated = runtime.workspace.inspect(depth=6, include_generated=True, max_entries=2000)
    generated_paths = _tree_paths(with_generated.tree)
    assert any(path == "node_modules" or path.startswith("node_modules/") for path in generated_paths)
    assert any(path == ".agents/tmp" or path.startswith(".agents/tmp/") for path in generated_paths)
    assert any(
        path == ".agents/scripts/agents_scripts.egg-info"
        or path.startswith(".agents/scripts/agents_scripts.egg-info/")
        for path in generated_paths
    )
    assert any(path == ".agents/tools/uv" or path.startswith(".agents/tools/uv/") for path in generated_paths)
    assert any(path == ".agents/wb" or path.startswith(".agents/wb/") for path in generated_paths)
    assert ".agents/data/telemetry/events.jsonl" in generated_paths
    assert ".git/HEAD" in generated_paths
    assert ".hidden-keep/note.md" not in generated_paths
