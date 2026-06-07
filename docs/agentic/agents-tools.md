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
| `.agents/agents.config` | Path configurations |

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

### Available Commands

```bash
# List all tools
./.agents/agents tools list

# Filter by type
./.agents/agents tools list --type validation
./.agents/agents tools list --type creation
./.agents/agents tools list --type automation

# Show tool details
./.agents/agents tools info doctor
./.agents/agents tools info wb-update

# Search by keyword
./.agents/agents tools search Validates
./.agents/agents tools search automate
./.agents/agents tools search create

# Help
./.agents/agents tools help
```

## How to Modify

### Main Functions

```python
def list_tools(tool_type: Optional[str] = None) -> None:
    """List all tools, optionally filtered by type."""

def show_tool_info(tool_id: str) -> None:
    """Show detailed information about a specific tool."""

def search_tools(query: str) -> None:
    """Search tools by keyword in description and usage."""

def load_tools_catalog() -> Dict:
    """Load and parse tools.json."""
```

### Adding New Tool to Catalog

1. Add entry to `.agents/tools.json`
2. Include: id, name, description, commands, when_to_use
3. Run `./.agents/agents tools validate`

## How to Test

```bash
# List tools
./.agents/agents tools list

# Get info
./.agents/agents tools info doctor

# Search
./.agents/agents tools search validation

# Validate catalog
./.agents/agents tools validate
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
Usage: .agents/agents doctor
AFOL: afol validate

Commands:
  doctor [args]  - Run validation

When to Use:
  - Before starting work
  - After creating new workstream
```

## Related

- [tools-json.md](./tools-json.md) - Tool catalog structure
- [agents-wrapper.md](./agents-wrapper.md) - CLI wrapper

---

*Document: `docs/agentic/agents-tools.md`*
