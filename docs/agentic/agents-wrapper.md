---
id: TOOL-011
theme: agents-wrapper
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-05-04T16:22:15-03:00'
links:
  tools_json: ./tools-json.md
  justfile: ./agents-wrapper.md
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

1. **Honors explicit script Python** - Uses `AGENTS_SCRIPT_PYTHON` when set to an executable interpreter, mainly for isolated validation repos
2. **Prefers local venv Python** - Uses `.agents/scripts/.venv/bin/python*` when present
3. **Uses project-local `uv` only for setup** - Provisions the environment through `.agents/tools/uv/bin/uv`
4. **Uses project-local managed Python** - Installs managed CPython under `.agents/tools/uv/python` and recreates stale venvs that point outside the project
5. **Executes with isolation** - Keeps cache writes inside `.agents/cache/uv`
6. **Preserves context** - Maintains working directory
7. **Unified interface** - `.agents/agents <command>`
8. **Command-map dispatch** - Efficient routing for scripts such as `knowledge`, `skills-sync`, and `memory`
9. **Runtime dispatch** - Runs `.agents/runtime/.venv/bin/*` entrypoints directly, with `uv run` only as an explicit opt-in fallback
10. **Sandbox diagnostics** - Reports blocked Unix socket capability explicitly when `uv sync` cannot start in a restricted sandbox

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/scripts/.venv/` | Virtualenv |
| `.agents/scripts/*.py` | Python scripts |
| `.agents/runtime/` | Central runtime package |

### Environment Overrides

| Variable | Purpose |
|----------|---------|
| `AGENTS_SCRIPT_PYTHON` | Explicit Python interpreter for legacy script commands; when set, the wrapper skips local `.venv` bootstrap. |
| `AGENTS_UV_CACHE_DIR` | Overrides the `uv` cache path used by wrapper setup and runtime routes. |
| `AGENTS_UV_BIN` | Explicit project-local `uv` binary path. |
| `AGENTS_UV_PYTHON_DIR` | Overrides the project-local managed Python install directory; default is `.agents/tools/uv/python`. |
| `AGENTS_UV_PYTHON_VERSION` | Overrides the managed Python version requested during hydration; default is `3.11`. |
| `AGENTS_UV_PYTHON_BIN` | Explicit Python interpreter for `uv sync`; intended for isolated validation only. |
| `AGENTS_ALLOW_SYSTEM_UV` | Opt in to using host `uv` as a fallback when the project-local binary is missing. |
| `AGENTS_ALLOW_SYSTEM_PYTHON` | Opt in to host Python fallback when `.agents/scripts/.venv` is missing. |
| `AGENTS_RUNTIME_ALLOW_UV_RUN` | Opt in to `uv run` fallback when runtime console scripts are missing. |
| `PYTHONHASHSEED` | Defaults to `0` inside wrapper/legacy just command runner execution so Python can start in sandboxes that block kernel randomness. |

### Files Executed

| Script | Command |
|--------|---------|
| `agents-doctor.py` | `.agents/agents doctor` |
| `agents-new.py` | `.agents/agents new <theme>` |
| `agents-tools.py` | `.agents/agents tools ...` |
| `agents-wb-update.py` | `.agents/agents wb-update ...` |
| `agents-telemetry.py` | `.agents/agents telemetry ...` |
| `agents-memory.py` | `.agents/agents memory ...` |
| `agentic_scaffold.cli` | `.agents/agents runtime ...` |
| `agentic_scaffold.cli` | `.agents/agents mcp ...` |
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
runtime             # Central runtime CLI
mcp                 # FastMCP-backed runtime CLI
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

# Test central runtime command
.agents/agents runtime manifest

# Test MCP adapter command
.agents/agents mcp validate

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

- [agents-wrapper.md](./agents-wrapper.md) - legacy just command-runner targets
- [agents-runtime.md](./agents-runtime.md) - Central runtime package
- [agents-mcp.md](./agents-mcp.md) - FastMCP adapter
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-wrapper.md`*
