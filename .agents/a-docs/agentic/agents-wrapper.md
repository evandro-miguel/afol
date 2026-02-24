---
id: TOOL-011
theme: agents-wrapper
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: '2026-02-24T16:15:00-03:00'
links:
  tools_json: ./tools-json.md
  makefile: ./makefile.md
---

# agents (Bash Wrapper) - CLI Entry Point

## Why It Exists

**Problem:** Python scripts require:
- Configured virtualenv
- Installed dependencies
- Correct `uv run` command
- Isolated environment

**Solution:** Bash wrapper that abstracts complexity and provides unified interface.

## Function

Bash wrapper that:

1. **Checks uv** - Ensures it's installed
2. **Checks .venv** - Creates if doesn't exist
3. **Executes with isolation** - `uv run --with pyyaml`
4. **Preserves context** - Maintains working directory
5. **Unified interface** - `.agents/agents <command>`
6. **Command-map dispatch** - Efficient routing (refactored 2026-02-24)

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
case "${COMMAND}" in
    new-command)
        cd "${ORIGINAL_PWD}"
        uv run --with pyyaml "${SCRIPTS_DIR}/agents-new-command.py" "$@"
        ;;
```

## How to Test

```bash
# Test wrapper
.agents/agents help

# Test specific command
.agents/agents doctor

# Test with args
.agents/agents new test-workstream
```

## Output

```
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
*Document: `.agents/a-docs/agentic/agents-wrapper.md`*
