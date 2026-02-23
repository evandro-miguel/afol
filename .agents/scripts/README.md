# Scripts

Python operational scripts for the `.agents/` system.

## Location

Scripts are stored in `.agents/scripts/` and executed via:

- **Makefile** (recommended): `make doctor`, `make new THEME=x`
- **Wrapper**: `.agents/agents doctor`
- **UV direct**: `uv run --with pyyaml .agents/scripts/agents-doctor.py`

## Available Scripts

| Script | Purpose |
|--------|---------|
| `agents-doctor.py` | Validate .agents structure |
| `agents-new.py` | Create new workstream |
| `agents-index.py` | Update SPECS/ADRS indexes |
| `agents-lint-docs.py` | Validate markdown docs |
| `agents-structure-map.py` | Generate project structure docs |
| `sync-agent-docs.py` | Sync AGENTS.md to agent files |
| `verify-tasks.py` | Check task completion |

## Documentation

Full usage documentation: `.agents/a-docs/standards/scripts-usage.md`

Quick reference: `.agents/a-docs/standards/scripts-quickstart.md`

## Setup

```bash
# One-time setup
cd .agents/scripts && uv sync
```

---
*Scripts folder: `.agents/scripts/`*
