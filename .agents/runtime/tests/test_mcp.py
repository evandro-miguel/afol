from __future__ import annotations

import json
import os

import pytest

from agentic_scaffold.models import ActionResult
from agentic_scaffold.runtime import AgenticRuntime


def _urandom_available() -> bool:
    try:
        os.urandom(1)
    except (NotImplementedError, OSError, PermissionError):
        return False
    return True


def _require_mcp_runtime():
    if not _urandom_available():
        pytest.skip("sandbox blocks randomness required by the FastMCP import chain")

    from fastmcp import Client

    from agentic_scaffold.server import build_mcp

    return Client, build_mcp


async def test_mcp_lists_tools_resources_and_prompts(scaffold_repo):
    Client, build_mcp = _require_mcp_runtime()
    mcp = build_mcp(scaffold_repo)

    async with Client(mcp) as client:
        tools = await client.list_tools()
        tool_names = {tool.name for tool in tools}
        action_tool_names = {spec.mcp_tool for spec in AgenticRuntime.action_specs()}
        assert action_tool_names <= tool_names
        assert {
            "search_docs",
            "validate_structure",
            "generate_manifest",
            "inspect_target_scaffold",
            "plan_scaffold_update",
            "archive_paths",
            "write_text_file",
            "apply_unified_diff",
            "undo_last_change",
        } <= tool_names

        resources = await client.list_resources()
        resource_uris = {str(resource.uri) for resource in resources}
        assert "repo://manifest" in resource_uris
        assert "repo://validation" in resource_uris
        assert "repo://tool-catalog" in resource_uris
        assert "repo://adoption-plan" in resource_uris
        assert any(uri.startswith("skill://demo-skill") for uri in resource_uris)

        prompts = await client.list_prompts()
        prompt_names = {prompt.name for prompt in prompts}
        assert "safe_refactor_plan" in prompt_names


async def test_mcp_tool_registration_and_resource_output(scaffold_repo):
    _Client, build_mcp = _require_mcp_runtime()
    mcp = build_mcp(scaffold_repo)
    manifest_tool = await mcp.get_tool("generate_manifest")
    assert manifest_tool is not None
    assert manifest_tool.name == "generate_manifest"

    manifest = manifest_tool.fn()
    assert manifest.skill_count == 1
    assert manifest.tool_catalog_count == 1
    assert manifest.runtime_docs["AGENTS.md"] is True

    adoption_plan_tool = await mcp.get_tool("plan_scaffold_update")
    assert adoption_plan_tool is not None
    adoption_plan = adoption_plan_tool.fn()
    assert adoption_plan.repo_root == str(scaffold_repo)
    assert "add-wrapper" in {action.kind for action in adoption_plan.actions}

    validation_resource = await mcp.get_resource("repo://validation")
    assert validation_resource is not None
    assert validation_resource.name == "Validation snapshot"

    validation_text = validation_resource.fn()
    assert "\n  " not in validation_text
    validation = json.loads(validation_text)
    assert validation["ok"] is True
    assert validation["created_dirs"] == []
    assert validation["issues"] == []

    tool_catalog_resource = await mcp.get_resource("repo://tool-catalog")
    assert tool_catalog_resource is not None
    assert tool_catalog_resource.name == "Tool catalog summary"

    tool_catalog = json.loads(tool_catalog_resource.fn())
    assert tool_catalog["available"] is True
    assert tool_catalog["tool_count"] == 1
    assert tool_catalog["tools"] == [
        {
            "id": "doctor",
            "type": "validation",
            "wrapper_command": ".agents/agents doctor",
        }
    ]

    command_registry_resource = await mcp.get_resource("repo://command-registry")
    assert command_registry_resource is not None
    assert command_registry_resource.name == "Runtime command registry"

    command_registry = json.loads(command_registry_resource.fn())
    assert command_registry["available"] is True
    commands = {item["name"]: item for item in command_registry["commands"]}
    assert {"status", "knowledge", "session", "doctor", "skills-sync", "verify-tasks"} <= set(commands)
    assert commands["status"]["script_name"] == "agents-status.py"
    assert commands["verify"]["alias_of"] == "verify-tasks"

    adoption_resource = await mcp.get_resource("repo://adoption-plan")
    assert adoption_resource is not None
    assert adoption_resource.name == "Scaffold adoption plan"
    adoption_payload = json.loads(adoption_resource.fn())
    assert adoption_payload["repo_root"] == str(scaffold_repo)
    assert "benchmark" in {action["kind"] for action in adoption_payload["actions"]}


async def test_mcp_runtime_health_smoke(scaffold_repo):
    _Client, build_mcp = _require_mcp_runtime()
    mcp = build_mcp(scaffold_repo)

    health_tool = await mcp.get_tool("runtime_health")
    assert health_tool is not None
    health_payload = health_tool.fn()
    assert isinstance(health_payload, dict)
    assert health_payload["status"] == "healthy"
    checks = health_payload["checks"]
    assert checks["repo_root"]["exists"] is True
    assert checks["repo_root"]["label"] == scaffold_repo.name
    assert checks["command_registry"]["required_available"] is True
    assert checks["tool_catalog"]["available"] is True
    assert str(scaffold_repo) not in str(health_payload)
    assert "AGENTIC_REPO_ROOT" not in str(health_payload)


async def test_mcp_inspect_workspace_rejects_invalid_depth(scaffold_repo):
    _Client, build_mcp = _require_mcp_runtime()
    mcp = build_mcp(scaffold_repo)
    inspect_tool = await mcp.get_tool("inspect_workspace")

    assert inspect_tool is not None
    with pytest.raises(ValueError, match="depth must be between 0 and 10"):
        inspect_tool.fn(depth=99)


async def test_mcp_inspect_workspace_accepts_core_max_entries_floor(scaffold_repo):
    _Client, build_mcp = _require_mcp_runtime()
    mcp = build_mcp(scaffold_repo)
    inspect_tool = await mcp.get_tool("inspect_workspace")

    assert inspect_tool is not None
    payload = inspect_tool.fn(max_entries=10)
    assert isinstance(payload, dict)
    assert payload["max_depth"] == 3


async def test_mcp_runtime_health_error_preserves_structured_payload(scaffold_repo, monkeypatch):
    _Client, build_mcp = _require_mcp_runtime()
    original_run_action = AgenticRuntime.run_action

    def _mock_error(self, action_id: str, **_kwargs: object) -> ActionResult:
        if action_id == "health":
            return ActionResult(
                status="error",
                message="runtime health check failed",
                payload={
                    "status": "unhealthy",
                    "checks": {"command_registry": {"required_available": False}},
                    "missing": [{"type": "command_registry", "name": "verify-tasks"}],
                },
            )
        return original_run_action(self, action_id, **_kwargs)

    monkeypatch.setattr(AgenticRuntime, "run_action", _mock_error)

    mcp = build_mcp(scaffold_repo)
    health_tool = await mcp.get_tool("runtime_health")
    assert health_tool is not None

    payload = health_tool.fn()
    assert payload["status"] == "unhealthy"
    assert payload["checks"]["command_registry"]["required_available"] is False
    assert payload["missing"][0]["name"] == "verify-tasks"


async def test_mcp_search_docs_rejects_empty_query(scaffold_repo):
    _Client, build_mcp = _require_mcp_runtime()
    mcp = build_mcp(scaffold_repo)
    search_tool = await mcp.get_tool("search_docs")

    assert search_tool is not None
    with pytest.raises(ValueError, match="query must be a non-empty string"):
        search_tool.fn(query="", limit=2)
