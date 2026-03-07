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
| `agents-knowledge.py` | Search and pull reusable workbench knowledge |
| `agents-new.py` | Create new workstream |
| `agents-index.py` | Update SPECS/ADRS indexes |
| `agents-lint-docs.py` | Validate markdown docs |
| `agents-structure-map.py` | Generate project structure docs |
| `sync-agent-docs.py` | Sync AGENTS.md to agent files |
| `verify-tasks.py` | Check task completion |
| `agents-status.py` | Show session status and resolved artifact pointers |
| `agents-implement.py` | Guided task execution (`next/start/complete`) |
| `agents-review.py` | Review session coherence and workflow constraints |
| `agents-revert.py` | Logical revert for task/phase/pack/session units with explicit confirmation |
| `agents-session.py` | Catch up or close a governed session with lifecycle-aware summaries |
| `agents-wb-update.py` | Automate `updated_at` and report `Files Changed` updates |

`agents-wb-update.py` supports task/status/timeline/link automation with explicit `--session` scope for write safety.
`agents-knowledge.py` provides low-token list/search/pull/show/index over research, brainstorm, explorer-check, report, and postmortem docs.
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
cd .agents/scripts && uv run pytest tests
```

## Session Lifecycle

```bash
python .agents/scripts/agents-session.py catchup
python .agents/scripts/agents-session.py catchup --session .agents/wb/260306_2128_context-driven-execution-commands
python .agents/scripts/agents-session.py catchup --json
python .agents/scripts/agents-session.py close
python .agents/scripts/agents-session.py close --session .agents/wb/260306_2128_context-driven-execution-commands
python .agents/scripts/agents-session.py close --session .agents/wb/260306_2128_context-driven-execution-commands --next-session .agents/wb/260306_2240_session-close-command
```

---
*Scripts folder: `.agents/scripts/`*
