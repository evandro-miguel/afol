---
id: TOOL-002
theme: agents-tools
type: tool-doc
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-04-13T19:36:53-03:00'
links:
  tools_json: ./tools-json.md
  wrapper: ./agents-wrapper.md
---

# agents-tools.py - Tool Discovery

## Why It Exists

**Problem:** When an autonomous agent receives a task, it needs to:

1. Discover which `.agents` system tool to use
2. Understand available subcommands and options
3. Learn use cases without reading source code

**Solution:** A discovery tool that lists, searches, and shows details of all tools registered in `tools.json`.

## Function

`agents-tools.py` is a **discovery and exploration** tool that:

1. **Lists** all available tools grouped by type
2. **Searches** tools by keyword in description and use cases
3. **Shows details** of a specific tool including subcommands
4. **Guides the agent** in the flow: discovery → selection → usage

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/tools.json` | Tool catalog |
| `.agents/config.json` | Path configurations |

### Files Written

| File | Purpose |
|------|---------|
| None | Tool is read-only |

### Output

| Type | Description |
|------|-------------|
| stdout | Formatted listing, details, search results |
| exit code | 0 = success, 1 = error (tool not found, etc.) |

## How to Configure

No public `afol tools` verb exists yet. Do not document the retired wrapper as a
downstream workflow.

### Available Commands

Current public validation path:

```bash
afol validate --json
```

## How to Modify

### Main Functions

Implement new tool catalog behavior in `cli/**` with Bun tests.

### Adding New Tool to Catalog

1. Add entry to `.agents/tools.json`
2. Include: id, name, description, commands, when_to_use
3. Run `afol validate --changed-path .agents/tools.json`

## How to Test

```bash
afol validate --changed-path .agents/tools.json
```

## Output Examples

### List Output

```text
Tools by Type:

validation:
  doctor          - Validate .agents structure
  lint-docs       - Validate markdown docs

creation:
  new             - Create new workstream
  bootstrap       - Install .agents in another repo
```

### Info Output

```text
Tool: doctor
Description: Validates .agents structure and integrity
Usage: afol validate

Commands:
  validate [args]  - Run validation

When to Use:
  - Before starting work
  - After creating new workstream
```

## Related

- [tools-json.md](./tools-json.md) - Tool catalog structure
- [agents-wrapper.md](./agents-wrapper.md) - CLI wrapper

---

*Document: `docs/agentic/agents-tools.md`*
