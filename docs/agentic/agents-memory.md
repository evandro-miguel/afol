---
id: TOOL-017
theme: agents-memory
type: tool-doc
status: active
owner: system
created_at: 2026-03-23 00:00:00-03:00
updated_at: '2026-03-23T20:38:52-03:00'
links:
  tools_json: ./tools-json.md
  config_doc: ./agents-config.md
  standards_usage: ../standards/agents-usage.md
---

# agents-memory.py - External Memory Contracts

## Why It Exists

**Problem:** Interactive agent runtimes can use external memory MCP servers, but the scaffold previously had no governed way to:

- distinguish repo-local `knowledge` from external memory
- tell an agent which server and tool to call
- express the correct boundary between auxiliary retrieval and canonical project state

**Solution:** A read-first adapter that resolves configured provider details and emits deterministic MCP contracts for interactive runtimes.

## Function

`agents-memory.py` is a **contract-emitting adapter** that:

1. **Shows provider status** - current provider, project, authority, and boundary
2. **Emits search contracts** - exact MCP server/tool/args for discovery
3. **Emits context contracts** - exact MCP flow for expanding a topic
4. **Emits recent/show contracts** - exact MCP calls for recent activity and one note
5. **Protects governance** - explicitly keeps `.agents/wb/` and repo-local `knowledge` canonical

Important constraint:

- This tool does **not** execute MCP tool calls from shell.
- It tells the host runtime what to call.

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/agents.config` | Memory provider config |
| `.agents/scripts/lib/agents_config.py` | Config loading and defaults |

### Files Written

| File | Purpose |
|------|---------|
| None | Read-only command family |

### Runtime Surface

| Command | Purpose |
|---------|---------|
| `memory status` | Show configured provider and boundary |
| `memory search <query>` | Emit exact MCP contract for search |
| `memory context <topic>` | Emit exact MCP contract or two-step flow for context expansion |
| `memory recent` | Emit exact MCP contract for recent activity |
| `memory show <identifier>` | Emit exact MCP contract for one note |

## How to Configure

### agents.config

```yaml
memory:
  enabled: true
  required: false
  provider: "basic_memory"
  mode: "contract"
  authority: "auxiliary"
  project: "main"
  workspace: ""
  runtime_server: "basic_memory"
  search_tool: "search_notes"
  context_tool: "build_context"
  recent_tool: "recent_activity"
  show_tool: "read_note"
```

Meaning of the key fields:

- `provider`: logical provider id understood by the scaffold
- `mode`: currently `contract`; the scaffold emits runtime contracts rather than executing MCP itself
- `authority`: should remain `auxiliary`, because external memory is not canonical workbench state
- `project`: default remote/local memory project to address
- `runtime_server`: exact MCP server name that interactive runtimes should call

## How to Use

### Wrapper Commands

```bash
# Inspect provider config and governance boundary
./.agents/agents memory status

# Emit MCP contract for search
./.agents/agents memory search "agent memory mcp integration" --runtime codex

# Emit MCP contract for contextual expansion
./.agents/agents memory context "persistent planning memory" --runtime codex

# Emit MCP contract for recent memory activity
./.agents/agents memory recent --timeframe 30d

# Emit MCP contract for a specific note
./.agents/agents memory show projects/260311-basic-memory-implementation/current-state
```

### Preferred Operator Order

1. Use repo-local `knowledge` first.
2. Use `memory search` or `memory context` if cross-project context is still needed.
3. Only then widen repo rereads or other exploration.

This preserves:

- `.agents/wb/` as canonical execution state
- repo-local `knowledge` as canonical reusable project history
- external memory as auxiliary retrieval

## How to Modify

### Main Functions

```python
def get_memory_config() -> Dict[str, Any]:
    """Resolve configured provider and command defaults."""

def cmd_status(args: argparse.Namespace) -> int:
    """Show provider, project, authority, and boundary."""

def cmd_search(args: argparse.Namespace) -> int:
    """Emit exact MCP search contract."""

def cmd_context(args: argparse.Namespace) -> int:
    """Emit exact MCP context-expansion flow."""
```

### Adding Another Provider

1. Add provider defaults to `SUPPORTED_PROVIDERS`
2. Extend config defaults in `agents_config.py`
3. Document the server/tool semantics here
4. Add tests covering provider selection and output
5. Keep the command truthful: do not claim shell-side execution if the host runtime is still required

## How to Test

```bash
./.agents/agents memory status
./.agents/agents memory search "agent memory" --runtime codex
./.agents/agents memory context "persistent planning memory" --runtime codex
./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_memory.py -q
```

## Output Characteristics

Expected output includes:

- exact server name
- exact tool name
- exact JSON arguments
- explicit boundary note that workbench and repo-local knowledge remain canonical

## Related

- [agents-config.md](./agents-config.md) - configuration surface
- [agents-wrapper.md](./agents-wrapper.md) - wrapper command map
- [tools-json.md](./tools-json.md) - tool catalog entry
- [../standards/agents-usage.md](../standards/agents-usage.md) - operator usage

---

*Document: `docs/agentic/agents-memory.md`*
