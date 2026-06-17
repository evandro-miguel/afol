---
name: agentic-scaffold-mcp
description: Use the scaffold runtime MCP lane for inspection, search, validation, archive, write, patch, and undo.
metadata:
  category: agentic
  tags: "agentic-scaffold, mcp, runtime, validation, archive, write, patch, undo"
  triggers: "agentic runtime, scaffold mcp, runtime manifest, runtime validate, mcp validate, archive paths, undo change"
  references: "runtime, mcp, safety"
  version: "1.0.0"
  updated_at: "2026-04-12T13:16:50Z"
  target_provider: universal
---

# agentic-scaffold-mcp

## When to use this skill

Use this skill when you need a fast, safe path for repository maintenance inside the agentic scaffold.

Choose this skill first for:

- bounded folder inspection
- quick document discovery
- scaffold validation
- safe archiving
- reversible text writes
- reversible patches

Do not use it to bypass roadmap/spec/workbench governance for multi-step work.

## Start sequence

1. Run `generate_manifest` or `.agents/agents runtime manifest`.
2. Run `search_docs` or `.agents/agents runtime search "<query>"` for roadmap/spec/rules context.
3. Run `validate_structure` or `.agents/agents runtime validate`.
4. Only then mutate files.
5. Prefer `archive_paths` over delete.
6. Use `undo_last_change` if validation regresses.

## Available tools

### `inspect_workspace`

Inputs:

- `depth`: integer, default `3`
- `include_hidden`: boolean, default `false`
- `max_entries`: integer, default `500`

Use it to get a compact repository tree without expanding too much context.

### `search_docs`

Inputs:

- `query`: string
- `limit`: integer, default `8`

It searches `docs/`, `docs/arc/`, `docs/map/`, `docs/knowledge/`, `docs/agentic/`, `.afol/wb/`, and `.agents/skills/`.

### `validate_structure`

Inputs:

- `auto_fix`: boolean, default `false`

Use it to detect missing scaffold folders, templates, and runtime docs. Set `auto_fix=true` only when missing directories should be created.

### `generate_manifest`

No inputs.

Use it to understand repository surfaces, script count, skills, runtime docs, tool catalog size, search roots, and blocked write roots.

### `archive_paths`

Inputs:

- `paths`: list of relative repo paths
- `slug`: archive label
- `reason`: text reason

Use it instead of deleting stale folders. It moves content into `.agents/z-arq/<timestamp>_<slug>` and records undo metadata.

### `write_text_file`

Inputs:

- `path`: relative repo path
- `content`: full text content
- `reason`: text reason

Use it for deterministic file creation or replacement when the exact final content is already known.

### `apply_unified_diff`

Inputs:

- `path`: relative repo path
- `diff`: unified diff text
- `reason`: text reason

Use it when you already have a precise patch.

### `undo_last_change`

No inputs.

Use it to revert the latest `archive_paths`, `write_text_file`, or `apply_unified_diff` operation.

## CLI fallback

When MCP tools are not mounted, use:

```bash
.agents/agents runtime manifest
.agents/agents runtime validate
.agents/agents runtime search "roadmap"
.agents/agents mcp inspect --depth 2
.agents/agents-mcp manifest
```

## Resources

- `repo://manifest`
- `repo://validation`
- `repo://tool-catalog`
- `skill://...` resources exposed from `.agents/skills/`
