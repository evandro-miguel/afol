---
id: TOOL-011
theme: agents-wrapper
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-03-23T20:38:52-03:00'
links:
  tools_json: ./tools-json.md
  makefile: ./makefile.md
---

# agents (Bash Wrapper) - CLI Entry Point

## Why It Exists

**Problem:** Python scripts require:

- Configured virtualenv
- Installed dependencies
- Consistent command routing
- Isolated environment

**Solution:** Bash wrapper that abstracts complexity and provides unified interface.

## Function

Bash wrapper that:

1. **Prefers local venv Python** - Uses `.agents/scripts/.venv/bin/python*` when present
2. **Uses `uv` only for setup** - Provisions the environment when `.venv` is missing
3. **Executes with isolation** - Keeps cache writes inside `.agents/cache/uv`
4. **Preserves context** - Maintains working directory
5. **Unified interface** - `.agents/agents <command>`
6. **Command-map dispatch** - Efficient routing for scripts such as `knowledge`, `skills-sync`, and `memory`

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/scripts/.venv/` | Virtualenv |
| `.agents/scripts/*.py` | Python scripts |

### Files Executed

| Script | Command |
|--------|---------|
| `agents-doctor.py` | `.agents/agents doctor` |
| `agents-new.py` | `.agents/agents new <theme>` |
| `agents-tools.py` | `.agents/agents tools ...` |
| `agents-wb-update.py` | `.agents/agents wb-update ...` |
| `agents-telemetry.py` | `.agents/agents telemetry ...` |
| `agents-memory.py` | `.agents/agents memory ...` |
| `agents-lint-docs.py` | `.agents/agents lint-docs` |
| ... | ... |

## How to Configure

### Available Commands

```bash
doctor              # Structure validation
new <theme>         # Create workstream
index               # Update indexes
lint-docs           # Markdown lint
structure-map       # Map structure
sync                # Sync agent docs
verify-tasks        # Verify tasks
 wb-update           # WB automation (touch/evidence/task/status/link/timeline/files-changed)
tools               # Tool discovery
telemetry           # Heat scoring
patterns            # Pattern suggestions
memory              # External memory MCP contracts
bootstrap           # Install in another repo
skills-sync         # Sync skills
fix-symlinks        # Repair symlinks
help                # Help
```

### Aliases

```bash
lint-docs → lint
structure-map → map
verify-tasks → verify
wb-update → wb
```

## How to Modify

### Add New Command

Edit `.agents/agents` bash script:

```bash
declare -A COMMAND_MAP=(
    ["memory"]="agents-memory"
)
```

## How to Test

```bash
# Test wrapper
.agents/agents help

# Test specific command
.agents/agents doctor

# Test contract-only external memory command
.agents/agents memory status

# Test with args
.agents/agents new test-workstream
```

## Output

```text
Agents CLI - Operational scripts for .agents system

Usage:
  .agents/agents <command> [args...]

Commands:
  doctor              Validate .agents structure
  new <theme>         Create new workstream
  ...
```

## Related

- [makefile.md](./makefile.md) - Makefile targets
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-wrapper.md`*
