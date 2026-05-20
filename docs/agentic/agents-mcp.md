---
doc_type: standard
id: 260411_agentic-mcp_standard_01
status: active
created_at: '2026-04-11T22:20:58-03:00'
updated_at: '2026-05-04T16:08:30-03:00'
---

# Agentic MCP

## Purpose

The scaffold MCP surface is the FastMCP adapter inside `.agents/runtime/`. It exposes bounded tools and resources for interactive agent runtimes while preserving the governed repository rules.

## CLI Usage

```bash
.agents/agents mcp manifest
.agents/agents mcp validate
.agents/agents mcp search "roadmap"
.agents/agents mcp inspect --depth 2
.agents/runtime/.venv/bin/agentic-mcp manifest
.agents/agents mcp archive docs/map/extra --slug stale-map --reason "archive generated leftovers"
.agents/agents mcp undo
.agents/agents-mcp manifest
```

## FastMCP Usage

```bash
cd .agents/runtime
../tools/uv/bin/uv run --locked fastmcp run
```

For local HTTP development:

```bash
cd .agents/runtime
../tools/uv/bin/uv run --locked fastmcp run dev.fastmcp.json
```

## Exposed Tools

- `inspect_workspace`
- `search_docs`
- `validate_structure`
- `generate_manifest`
- `archive_paths`
- `write_text_file`
- `apply_unified_diff`
- `undo_last_change`
- `inspect_target_scaffold`
- `plan_scaffold_update`

## Exposed Resources

- `repo://manifest`
- `repo://validation`
- `repo://tool-catalog`
- `skill://...` resources from `.agents/skills/`

## Operating Rule

Use MCP tools for compact discovery, validation, reversible repository maintenance, and skill/resource exposure. Keep multi-command workstreams governed by roadmap/spec/workbench documents, and use `.agents/agents` legacy commands where no runtime equivalent exists yet.

Use `inspect_target_scaffold` and `plan_scaffold_update` when the target repo
already exists and needs an overlay update rather than a fresh bootstrap.
