---
id: TOOL-001
theme: tools-json
type: tool-doc
status: active
owner: system
created_at: 2026-02-23T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  agents_config: ../agents.config
  agents_tools: ./agents-tools.md
---

# tools.json - Tool Catalog

## Why It Exists

**Problem:** Autonomous agents need to discover which tools are available, when to use them, and how to get details about subcommands and options.

**Solution:** A centralized JSON file that documents all `.agents` system tools with:
- Clear descriptions
- Use cases (when_to_use)
- Commands and options
- Type classification
- Execution metadata

## Function

`tools.json` serves as:

1. **Tool catalog** - Lists all available tools
2. **Discovery guide** - Used by `agents-tools.py` for `list`, `info`, `search` commands
3. **Technical reference** - Documents subcommands, options, and usage patterns
4. **Classifier** - Categorizes tools by type and execution mode

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/tools.json` | Primary source (this file) |
| `.agents/agents.config` | Path configurations |

### Files Written

| File | Purpose |
|------|---------|
| None | tools.json is read-only at runtime |

### Files Updated (human editing)

| File | When |
|------|------|
| `.agents/tools.json` | When adding new tool |

## How to Configure

### JSON Structure

```json
{
  "version": "1.0.0",
  "updated_at": "2026-02-23T00:00:00-03:00",
  "description": "Tool catalog...",
  "tools": [...],
  "makefile_targets": {...},
  "tool_categories": {...},
  "execution_modes": {...},
  "makefile_aliases": {...},
  "best_practices": [...]
}
```

### Main Sections

#### `tools` (array)

List of all tools. Each tool has:

```json
{
  "id": "doctor",
  "name": "Agents Doctor",
  "tool": "agents-doctor.py",
  "wrapper_command": ".agents/agents doctor",
  "make_command": "make doctor",
  "type": "validation",
  "execution_mode": "on-demand",
  "description": "Validates .agents structure...",
  "when_to_use": [...],
  "commands": [...],
  "output": "...",
  "side_effect": "..."
}
```

#### `tool_categories`

Groups tools by purpose:

```json
{
  "validation": {
    "description": "Validates structure, syntax, and compliance",
    "tools": ["doctor", "lint-docs"],
    "usage_pattern": "Run before commits or as quality gate"
  },
  "creation": {
    "description": "Creates new files and workstreams",
    "tools": ["new", "bootstrap"],
    "usage_pattern": "Start of new feature, bug fix, or investigation"
  }
}
```

#### `execution_modes`

Describes when each tool runs:

```json
{
  "on-demand": {
    "description": "Manual execution on user/agent command",
    "tools": ["tools", "doctor", "new", ...]
  },
  "cron": {
    "description": "Scheduled periodic execution",
    "suggested": ["doctor (daily in CI/CD)", "lint-docs (pre-commit hook)"]
  },
  "event-driven": {
    "description": "Triggered by specific events",
    "tools": {
      "new": "When creating new feature/bug",
      "index": "After creating spec/adr"
    }
  }
}
```

## How to Modify

### Add New Tool

1. Add entry to `tools` array
2. Include all required fields
3. Add to appropriate category in `tool_categories`
4. Add to `execution_modes.on-demand.tools`
5. Run `./.agents/agents tools validate`

### Update Existing Tool

1. Find tool by `id`
2. Update fields
3. Update `updated_at` timestamp
4. Validate: `./.agents/agents tools validate`

## How to Test

```bash
# Validate catalog
./.agents/agents tools validate

# List tools
./.agents/agents tools list

# Get tool info
./.agents/agents tools info doctor

# Search tools
./.agents/agents tools search validation
```

## Related

- [agents-tools.md](./agents-tools.md) - Tool discovery
- [agents-config.md](./agents-config.md) - Configuration

---
*Document: `.agents/a-docs/agentic/tools-json.md`*
