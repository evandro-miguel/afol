---
id: TOOL-012
theme: justfile
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-04-11T22:27:09-03:00'
links:
  tools_json: ./tools-json.md
  wrapper: ./agents-wrapper.md
---

# Justfile - Targets and Aliases

## Why It Exists

**Problem:** `.agents/agents` commands are verbose for frequent use. Developers prefer:

- Short commands
- Shell autocomplete
- Composed workflows

**Solution:** Justfile with named targets and short aliases.

## Function

Provides:

1. **Named targets** - `just doctor`, `just new`
2. **Short aliases** - `st`, `ix`, `sy`, `vf`, `dr`
3. **Composed workflows** - `just all`, `just refresh`
4. **Variables** - `THEME=`, `TASK_ID=`, etc.
5. **Runtime contract helpers** - command shortcuts for skills, optional external memory, and the central agentic runtime

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `docs/standards/Justfile` | Main Justfile |
| `.agents/agents.config` | Configuration |
| `.agents/runtime/pyproject.toml` | Runtime package project file |

### Files Executed

| Target | Command Executed |
|--------|------------------|
| `just doctor` | `.agents/agents doctor` |
| `just new THEME=x` | `.agents/agents new x` |
| `just verify` | `.agents/agents verify-tasks` |
| `just lint-runtime` | `uv run --project .agents/runtime --locked ruff check .agents/runtime` |
| `just test-runtime` | `uv run --project .agents/runtime --locked pytest .agents/runtime/tests` |
| `just runtime-mcp-smoke` | `.agents/agents runtime ...` and `.agents/agents-mcp ...` smoke checks |

## How to Configure

### Main Targets

```justfile
just setup        # Virtualenv setup
just setup-runtime # Central runtime environment setup
just doctor       # Structure validation
just new          # Create workstream (THEME=required)
just structure    # Generate structure docs
just index        # Update indexes
just sync         # Sync agent docs
just verify       # Verify tasks
just lint         # Markdown lint
just memory-status  # Show external memory provider config
just memory-search QUERY=x  # Emit memory MCP contract
just lint-runtime # Lint central runtime package
just test-runtime # Run central runtime tests
just runtime-mcp-smoke # Smoke runtime and MCP CLIs
just all          # Full validation
```

Runtime setup and validation use the checked-in `.agents/runtime/uv.lock` through `uv --locked`.

### Short Aliases

```justfile
st: structure     # structure
ix: index         # index
sy: sync          # sync
vf: verify        # verify
dr: doctor        # doctor (do NOT use doc!)
```

### Targets with Variables

```justfile
just new THEME=auth-refactor
just wb-task TASK_ID=T-01 ACTION=done
just wb-status STATUS=active
just wb-timeline MSG="Implemented login"
just memory-search QUERY="agent memory" RUNTIME=codex
```

## How to Modify

### Add New Target

Edit `docs/standards/Justfile`:

```justfile
new-target:
	@echo "→ Running new target..."
	@./.agents/agents new-command
```

## How to Test

```bash
# List targets
just help

# Run target
just doctor

# Run with variable
just new THEME=test
```

## Output

```text
╔═══════════════════════════════════════════════════════════╗
║         Agents System - Available Commands                ║
╠═══════════════════════════════════════════════════════════╣
║  Setup & Maintenance                                      ║
║    just setup        - Initialize UV virtualenv           ║
║    just doctor       - Validate .agents structure         ║
║    ...                                                    ║
╚═══════════════════════════════════════════════════════════╝
```

## Related

- [agents-wrapper.md](./agents-wrapper.md) - Bash wrapper
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/justfile.md`*
