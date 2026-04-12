from __future__ import annotations

import json

from fastmcp import Client

from agentic_scaffold.server import build_mcp


async def test_mcp_lists_tools_resources_and_prompts(scaffold_repo):
    mcp = build_mcp(scaffold_repo)

    async with Client(mcp) as client:
        tools = await client.list_tools()
        tool_names = {tool.name for tool in tools}
        assert {
            "inspect_workspace",
            "search_docs",
            "validate_structure",
            "generate_manifest",
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
        assert any(uri.startswith("skill://demo-skill") for uri in resource_uris)

        prompts = await client.list_prompts()
        prompt_names = {prompt.name for prompt in prompts}
        assert "safe_refactor_plan" in prompt_names


async def test_mcp_tool_registration_and_resource_output(scaffold_repo):
    mcp = build_mcp(scaffold_repo)
    manifest_tool = await mcp.get_tool("generate_manifest")
    assert manifest_tool is not None
    assert manifest_tool.name == "generate_manifest"

    manifest = manifest_tool.fn()
    assert manifest.skill_count == 1
    assert manifest.tool_catalog_count == 1
    assert manifest.runtime_docs["AGENTS.md"] is True

    validation_resource = await mcp.get_resource("repo://validation")
    assert validation_resource is not None
    assert validation_resource.name == "Validation snapshot"

    validation = json.loads(validation_resource.fn())
    assert validation["ok"] is True
    assert validation["created_dirs"] == []
    assert validation["issues"] == []
