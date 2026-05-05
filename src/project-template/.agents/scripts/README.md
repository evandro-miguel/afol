---
doc_type: standard
id: readme
theme: scripts
status: active
created_at: '2026-05-05T11:50:54+00:00'
updated_at: '2026-05-05T11:50:54+00:00'
---

# Scripts

Python operational scripts for the `.agents/` system.

## Location

Scripts are stored in `.agents/scripts/` and executed via:

- **Justfile** (canonical): `just doctor`, `just new THEME=x`
- **Wrapper**: `.agents/agents doctor`
- **UV direct**: `uv run --with pyyaml .agents/scripts/agents-doctor.py`

The wrapper is hermetic by default: once `.agents/scripts/.venv` exists, it runs scripts through the local interpreter directly.
`uv` is only required to provision or refresh the local environment.

## Central Configuration

All operational scripts read settings from `.agents/agents.config`.

Use this file to adapt paths, timezone offsets, lint exclusions, doctor requirements, and sync targets per project.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `agents-doctor.py` | Validate .agents structure |
| `agents-tools.py` | Discover and inspect available tools |
| `agents-tools-smoke.py` | Smoke-test `tools` CLI behavior |
| `agents-bootstrap.py` | Bootstrap a generic .agents baseline into another repository, including partial install for live projects |
| `agents-fix-symlinks.py` | Repair agent symlinks and fallback to copy replication |
| `agents-skills-sync.py` | Sync, discover, and ensure project skills from universal-skills |
| `agents-knowledge.py` | Search and pull reusable workbench knowledge |
| `agents-new.py` | Create new workstream |
| `agents-index.py` | Update SPECS/ADRS indexes |
| `agents-lint-docs.py` | Validate markdown docs |
| `agents-structure-map.py` | Generate project structure docs |
| `agents-repo-map.py` | Generate or refresh the full repository codemap |
| `sync-agent-docs.py` | Sync AGENTS.md to agent files |
| `verify-tasks.py` | Check task completion and enforce final ExecPlan closure rules in strict mode |
| `agents-status.py` | Show session status and resolved artifact pointers |
| `agents-implement.py` | Guided task execution (`next/start/complete`) |
| `agents-review.py` | Review session coherence and workflow constraints |
| `agents-revert.py` | Logical revert for task/phase/pack/session units with explicit confirmation |
| `agents-session.py` | Catch up or close a governed session with lifecycle-aware summaries |
| `agents-wb-update.py` | Automate `updated_at` and report `Files Changed` updates |

`agents-wb-update.py` supports task/status/timeline/link automation with explicit `--session` scope for write safety.
`agents-knowledge.py` provides low-token list/search/pull/show/index over research, brainstorm, explorer-check, report, and postmortem docs.
`agents-repo-map.py` wraps the external `docker-analisys-tools` runner so `docs/map/` can be refreshed through a project-local command instead of ad-hoc shell usage.
For per-process isolation, set `AGENTS_ACTIVE_SESSION_FILE` to use a custom active-session pointer.

Tools catalog source: `.agents/tools.json`.
Catalog validation: `./.agents/agents tools validate`.

**Tool Discovery:** Use `.agents/agents tools list` to see all available tools with descriptions, then `.agents/agents tools info <tool-id>` for detailed info including subcommands.

## Documentation

Tool catalog: `.agents/tools.json`

Command help:

```bash
./.agents/agents tools list
./.agents/agents tools info <tool-id>
```

## Setup

```bash
# One-time setup
cd .agents/scripts && uv sync
```

The scaffold uses a repo-local UV cache during setup and validation: `.agents/cache/uv/`.

Bootstrap exports are sanitized by design: the target repo gets generic roadmap/spec baselines and empty knowledge indexes, not this scaffold's local `wb/`, lessons history, telemetry reports, or live roadmap/spec backlog.
Bootstrap also copies `docs/templates/plan.md` so downstream repos inherit the reusable ExecPlan starter.
For full bootstrap, the target directory is created automatically when missing.
For existing projects, use `--partial` so bootstrap fills only the missing scaffold surface and leaves project-owned files intact.
The preferred source seed is `.agents/source/universal-skills/` inside the repo. It must not be a nested git checkout.
Bootstrap seeds `.agents/source/universal-skills/` from committed `.agents/skills/` content, so the default downstream install path is self-contained.
`skills-sync pull` refreshes an external git checkout only when `AGENTS_UNIVERSAL_SKILLS_SOURCE` or `skills_sync.external_source_dir` is configured.
`skills-sync list` / `skills-sync search` prefer that external catalog when configured.
`skills-sync sync` / `skills-sync update` are the one-step paths that actually refresh `.agents/skills/`.
`skills-sync push` is a branch/PR proposal flow. It requires an external universal-skills checkout and refuses direct pushes to `main`.
The skills baseline is intentionally generic here; downstream repos should keep their own selection/pin model while the universal-skills contract evolves.

Discovery examples:

```bash
./.agents/agents skills-sync list --runtime codex
./.agents/agents skills-sync search markdown --runtime codex
./.agents/agents skills-sync sync --runtime codex
./.agents/agents skills-sync ensure agentic-folder-sys --runtime codex
```

Use `./.agents/agents bootstrap /path/to/existing-project --partial` when adopting the scaffold into an existing repo. Existing files stay in place unless `--force` is used. If that repo already has its own `just all`, use `just agents-all` for the scaffold aggregate validation. See `docs/standards/bootstrap-other-repo.md` for the full/partial install split and limitations.

## Tests

```bash
just test-scripts
just test-scripts-integration
just test-scripts-all
just lint-scripts
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
