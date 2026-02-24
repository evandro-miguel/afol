# Scripts

Python operational scripts for the `.agents/` system.

## Location

Scripts are stored in `.agents/scripts/` and executed via:

- **Makefile** (recommended): `make doctor`, `make new THEME=x`
- **Wrapper**: `.agents/agents doctor`
- **UV direct**: `uv run --with pyyaml .agents/scripts/agents-doctor.py`

## Central Configuration

All operational scripts read settings from `.agents/agents.config`.

Use this file to adapt paths, timezone offsets, lint exclusions, doctor requirements, and sync targets per project.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `agents-doctor.py` | Validate .agents structure |
| `agents-tools.py` | Discover and inspect available tools |
| `agents-tools-smoke.py` | Smoke-test `tools` CLI behavior |
| `agents-bootstrap.py` | Bootstrap .agents system into another repository |
| `agents-fix-symlinks.py` | Repair agent symlinks and fallback to copy replication |
| `agents-skills-sync.py` | Sync project skills from universal-skills |
| `agents-new.py` | Create new workstream |
| `agents-index.py` | Update SPECS/ADRS indexes |
| `agents-lint-docs.py` | Validate markdown docs |
| `agents-structure-map.py` | Generate project structure docs |
| `sync-agent-docs.py` | Sync AGENTS.md to agent files |
| `verify-tasks.py` | Check task completion |
| `agents-wb-update.py` | Automate `updated_at` and report `Files Changed` updates |

`agents-wb-update.py` supports task/status/timeline/link automation with explicit `--session` scope for write safety.
For per-process isolation, set `AGENTS_ACTIVE_SESSION_FILE` to use a custom active-session pointer.

Tools catalog source: `.agents/tools.json`.
Catalog validation: `./.agents/agents tools validate`.

**Tool Discovery:** Use `.agents/agents tools list` to see all available tools with descriptions, then `.agents/agents tools info <tool-id>` for detailed info including subcommands.

## Documentation

Full usage documentation: `.agents/a-docs/standards/scripts-usage.md`

Quick reference: `.agents/a-docs/standards/scripts-quickstart.md`

## Setup

```bash
# One-time setup
cd .agents/scripts && uv sync
```

## Tests

```bash
python3 -m unittest discover -s .agents/scripts/tests -p "test_*.py" -v
```

---
*Scripts folder: `.agents/scripts/`*
