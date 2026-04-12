---
id: TOOL-012
theme: makefile
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-04-11T22:27:09-03:00'
links:
  tools_json: ./tools-json.md
  wrapper: ./agents-wrapper.md
---

# Makefile - Targets and Aliases

## Why It Exists

**Problem:** `.agents/agents` commands are verbose for frequent use. Developers prefer:

- Short commands
- Shell autocomplete
- Composed workflows

**Solution:** Makefile with named targets and short aliases.

## Function

Provides:

1. **Named targets** - `make doctor`, `make new`
2. **Short aliases** - `st`, `ix`, `sy`, `vf`, `dr`
3. **Composed workflows** - `make all`, `make refresh`
4. **Variables** - `THEME=`, `TASK_ID=`, etc.
5. **Runtime contract helpers** - command shortcuts for skills, optional external memory, and the central agentic runtime

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `docs/standards/Makefile` | Main Makefile |
| `.agents/agents.config` | Configuration |
| `.agents/runtime/pyproject.toml` | Runtime package project file |

### Files Executed

| Target | Command Executed |
|--------|------------------|
| `make doctor` | `.agents/agents doctor` |
| `make new THEME=x` | `.agents/agents new x` |
| `make verify` | `.agents/agents verify-tasks` |
| `make lint-runtime` | `uv run --project .agents/runtime --locked ruff check .agents/runtime` |
| `make test-runtime` | `uv run --project .agents/runtime --locked pytest .agents/runtime/tests` |
| `make runtime-mcp-smoke` | `.agents/agents runtime ...` and `.agents/agents-mcp ...` smoke checks |

## How to Configure

### Main Targets

```makefile
make setup        # Virtualenv setup
make setup-runtime # Central runtime environment setup
make doctor       # Structure validation
make new          # Create workstream (THEME=required)
make structure    # Generate structure docs
make index        # Update indexes
make sync         # Sync agent docs
make verify       # Verify tasks
make lint         # Markdown lint
make memory-status  # Show external memory provider config
make memory-search QUERY=x  # Emit memory MCP contract
make lint-runtime # Lint central runtime package
make test-runtime # Run central runtime tests
make runtime-mcp-smoke # Smoke runtime and MCP CLIs
make all          # Full validation
```

Runtime setup and validation use the checked-in `.agents/runtime/uv.lock` through `uv --locked`.

### Short Aliases

```makefile
st: structure     # structure
ix: index         # index
sy: sync          # sync
vf: verify        # verify
dr: doctor        # doctor (do NOT use doc!)
```

### Targets with Variables

```makefile
make new THEME=auth-refactor
make wb-task TASK_ID=T-01 ACTION=done
make wb-status STATUS=active
make wb-timeline MSG="Implemented login"
make memory-search QUERY="agent memory" RUNTIME=codex
```

## How to Modify

### Add New Target

Edit `docs/standards/Makefile`:

```makefile
new-target:
	@echo "→ Running new target..."
	@./.agents/agents new-command
```

## How to Test

```bash
# List targets
make help

# Run target
make doctor

# Run with variable
make new THEME=test
```

## Output

```text
╔═══════════════════════════════════════════════════════════╗
║         Agents System - Available Commands                ║
╠═══════════════════════════════════════════════════════════╣
║  Setup & Maintenance                                      ║
║    make setup        - Initialize UV virtualenv           ║
║    make doctor       - Validate .agents structure         ║
║    ...                                                    ║
╚═══════════════════════════════════════════════════════════╝
```

## Related

- [agents-wrapper.md](./agents-wrapper.md) - Bash wrapper
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/makefile.md`*
