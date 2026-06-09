---
doc_type: standard
id: 260411_agentic-mcp_standard_01
status: active
created_at: '2026-04-11T22:20:58-03:00'
updated_at: '2026-05-04T16:08:30-03:00'
---

# Agentic MCP

## Purpose

The scaffold MCP surface is legacy factory-only runtime work. Public downstream
usage must wait for an AFOL-native verb or an explicit project-scoped MCP
configuration.

## CLI Usage

No public AFOL MCP command is available yet. Keep MCP routing factory-only until
a public verb lands.

## FastMCP Usage

Factory-only FastMCP launch details are intentionally not documented as a
downstream command.

For local HTTP development:

Use a project-scoped MCP configuration only after the AFOL-native contract is
defined.

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

Use MCP tools for compact discovery, validation, reversible repository
maintenance, and skill/resource exposure only through configured project MCP
surfaces. Keep multi-command workstreams governed by roadmap/spec/workbench
documents and route public CLI behavior through `afol`.

Use `inspect_target_scaffold` and `plan_scaffold_update` when the target repo
already exists and needs an overlay update rather than a fresh bootstrap.
