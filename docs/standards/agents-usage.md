---
doc_type: standard
id: agents-usage-standard
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-12T14:11:34-03:00'
---

# Agents System Usage

## Overview

This document describes how to use the `.agents/` operational system.

## Central Configuration

All scripts load settings from `.agents/agents.config` (preferred).
Legacy fallback: `agents.config` in the repository root.
Use this file to adjust paths, timezone offsets, lint exclusions, doctor requirements, and sync targets for each project.
It also holds the declarative `workflow.artifact_manifest` catalog and the
`workflow.artifact_policy` intent rules for workstream creation, readiness, and
future policy-backed command behavior.

## Quick Start

### Using Makefile (Recommended)

```bash
# Show all commands
make help

# Validate structure
make doctor

# Create workstream
make new THEME=auth-refactor

# Full validation
make all
```

### Using Wrapper CLI

```bash
.agents/agents help
.agents/agents doctor
.agents/agents new auth-refactor --spec
.agents/agents status --session .agents/wb/260223_1200_auth-refactor
.agents/agents session catchup --session .agents/wb/260223_1200_auth-refactor
.agents/agents session close --session .agents/wb/260223_1200_auth-refactor
```

Wrapper contract:

- Use `.agents/scripts/.venv` directly for normal command execution when it exists.
- Require `uv` only for setup or environment refresh.
- Keep UV cache writes inside `.agents/cache/uv/` so the scaffold remains usable in isolated workspaces.
- Use `./.agents/agents bootstrap /path/to/existing-project --partial` for live repos so project-owned files stay intact.
- Treat the skills baseline as an adoption artifact, not as scaffold-local history.
- Treat external memory as an optional, auxiliary retrieval layer; repo-local `knowledge` and `.agents/wb/` remain canonical.

## Available Commands

### Setup & Maintenance

| Command | Description |
|---------|-------------|
| `make setup` | Initialize UV virtualenv |
| `make clean` | Remove .venv and cache files |
| `make doctor` | Validate .agents structure |

### Documentation

| Command | Description |
|---------|-------------|
| `make structure` | Generate project structure docs |
| `make index` | Update SPECS/ADRS indexes |
| `make sync` | Sync AGENTS.md to agent files |
| `make tools-check` | Validate tools catalog and run tools CLI smoke tests |

### Workflows

| Command | Description | Options |
|---------|-------------|---------|
| `make new` | Create workstream | `THEME=<name>` `SPEC=1\|lite` |
| `make quick` | Reuse active session for small task | `THEME=<name>` |
| `make bootstrap` | Bootstrap .agents system in another repository | `TARGET=/path/to/repo` |
| `make verify` | Check task completion | - |
| `make lint` | Validate markdown docs | - |
| `make skills-init` | Initialize universal skills sync | - |
| `make skills-pull` | Refresh configured external git-backed skills source only | - |
| `make skills-update` | Refresh `.agents/skills/` from the configured git source | `SKILLS=a,b,c`, `RUNTIME=codex`, `PROFILE=x` |
| `make skills-list` | List available or selected upstream skills | `RUNTIME=codex`, `PROFILE=x`, `SELECTED=1`, `INSTALLED=1` |
| `make skills-search` | Search upstream skills by keyword | `QUERY=x`, `RUNTIME=codex`, `PROFILE=x`, `LIMIT=20`, `SELECTED=1` |
| `make skills-plan` | Preview selected skills drift/missing state | `SKILLS=a,b,c` |
| `make skills-apply` | Apply selected skills to `skills/` | `SKILLS=a,b,c` |
| `make skills-ensure` | Ensure one skill into `skills/` | `SKILL=name`, `RUNTIME=codex`, `PROFILE=x`, `PERSIST=1`, `PULL=1` |
| `make skills-push` | Publish selected local skills back to the git-backed source | `SKILL=name` or `SKILLS=a,b`, `COMMIT=1`, `PUSH=1`, `MESSAGE=x` |
| `make skills-status` | Show skills sync status/config | - |
| `make skills-check` | Validate skills structure/sync state | `SKILLS=a,b,c` |
| `make skills-sync` | Refresh `.agents/skills/` from the configured git source | `SKILLS=a,b,c` |
| `make memory-status` | Show configured external-memory provider/boundary | - |
| `make memory-search` | Emit MCP contract for external memory search | `QUERY=x`, `RUNTIME=codex`, `PROJECT=x`, `LIMIT=5` |
| `make memory-context` | Emit MCP contract for memory context expansion | `TOPIC=x`, `RUNTIME=codex`, `PROJECT=x`, `URL=memory://...` |
| `make memory-recent` | Emit MCP contract for recent memory activity | `TIMEFRAME=7d`, `RUNTIME=codex`, `PROJECT=x` |
| `make memory-show` | Emit MCP contract for one memory note | `NOTE=x`, `RUNTIME=codex`, `PROJECT=x` |
| `make wb-touch` | Update `updated_at` in active session docs | - |
| `make wb-normalize-time` | Normalize `created_at`/`updated_at` to configured WB offset | - |
| `make wb-files-changed` | Refresh report `Files Changed` section | - |
| `make wb-task` | Mark task by ID in active session | `TASK_ID=T-01 ACTION=done\|in_progress\|pending\|ready\|blocked\|skipped` |
| `make wb-status` | Set frontmatter status | `STATUS=<value>` `FILE=plan\|task\|spec-lite\|report\|log\|all` (`spec-lite` remains the current compatibility key for child specs) |
| `make wb-timeline` | Append log timeline entry | `MSG=\"text\"` |
| `make wb-link` | Set frontmatter link field | `FILE=<doc>` `KEY=<k>` `VALUE=<v>` |
| `make test-scripts` | Run script unit tests | - |
| `make test-scripts-integration` | Run isolated integration tests | - |
| `make test-scripts-all` | Run unit + integration tests with the 80% scripts coverage gate | - |

### Quick Workflows

| Command | Description |
|---------|-------------|
| `make all` | Run full validation (doctor + structure + index + lint + tools-check + `test-scripts-all`) |
| `make refresh` | Clean + setup + structure |
| `make docs` | Structure + index + sync |
| `make check` | Doctor + lint + verify |
| `make init` | Setup + doctor |

Bootstrap workflow note:

- Fresh repos use the full bootstrap path.
- Existing repos should use the partial install path so the scaffold adds missing files without overwriting the live project unless `--force` is intentionally supplied.

External memory workflow note:

- Start with repo-local `knowledge` for project history.
- Use `memory` when cross-project or durable external context is still needed.
- Do not treat external memory results as authoritative plan/task/report state for the current repo.

## Scripts Reference

### agents-doctor.py

Validates `.agents` folder structure and integrity.

**Checks:**

- Required folders exist
- Templates are present
- YAML frontmatter is valid
- IDs follow naming convention
- Timestamps are ISO 8601 with Z suffix

**Usage:**

```bash
make doctor
# OR
.agents/agents doctor
# OR
uv run --with pyyaml .agents/scripts/agents-doctor.py
```

---

### agents-new.py

Creates or extends a workstream with only the artifacts justified by the selected intent.

**Creates:**

- Session folder with proper naming
- Only the artifacts justified by the selected intent
- Optional spec file (`--spec` or `--spec-lite`; `--spec-lite` is the current compatibility alias while docs move to `spec-child`)
- Sets `.agents/wb/.active_session`

**Catalog + policy contract:**

- The generated artifact order is declared in `.agents/agents.config` under `workflow.artifact_manifest`.
- The catalog is an ordered `artifacts:` list with `doc_type`, `template`, `phase`, `purpose`, optional `depends_on`, and optional `flag` / `id_placeholder` / `replacements`.
- `workflow.artifact_policy` defines which artifacts are created by default for each intent.
- The default `delivery` intent creates only `task`; `plan`, `report`, and `postmortem` are materialized only when explicitly needed.
- The default `planning` intent now creates `brainstorm`, `explorer-check`, and `plan`; use `--plan-only` or narrower intents when intentionally staying lightweight.
- When `--intent` is omitted, obvious themes such as `investigation`, `brainstorm`, `explore`, and `postmortem` are inferred into a safer non-delivery intent.
- `--with <doc-type>` adds specific justified artifacts instead of forcing the full package.
- `agents-status` reads the same catalog + policy to summarize which artifacts are missing, blocked, invalid, ready, or done.

**Policy:**

- One active workstream at a time
- Use `--quick` for non-significant tasks (no new folder)
- Use `--force-new` only for significant new streams

**Usage:**

```bash
# Basic delivery (task only by default)
make new THEME=auth-refactor SPEC=lite

# Research-only workstream
make new THEME=auth-investigation INTENT=research

# With full spec
make new THEME=api-endpoint SPEC=1

# With lite spec (legacy compatibility alias for spec-child)
make new THEME=bugfix-login SPEC=lite

# Quick task in current active session
make quick THEME=small-fix

# Direct
.agents/agents new auth-refactor --spec
.agents/agents new api-endpoint --spec-lite
.agents/agents new auth-investigation --intent research
.agents/agents new tiny-fix --quick
.agents/agents new major-refactor --force-new --spec
```

`--spec-lite` remains the current command flag for compatibility. Canonical governance wording now uses `spec-child`.

---

### agents-index.py

Updates INDEX.md files for SPECS and ADRs.

**Scans:**

- `docs/arc/SPECS/` for spec files
- `docs/arc/DECISIONS/` for adr files

**Updates:**

- `docs/arc/SPECS/INDEX.md`
- `docs/arc/DECISIONS/INDEX.md`

**Usage:**

```bash
make index
# OR
.agents/agents index
```

---

### agents-lint-docs.py

Validates markdown docs for consistency.

**Checks:**

- Checkbox markers are consistent (`- [X]` format)
- Status fields are valid
- State values are valid
- Required frontmatter fields exist
- Temporary folders such as `.agents/tmp/`, `.tmp/`, and repo-local `tmp/` are always excluded
- Raw codemap evidence under `.agents/arc/map/extra/` and `docs/map/extra/` is excluded from markdown lint

**Usage:**

```bash
make lint
# OR
.agents/agents lint-docs
# OR
.agents/agents lint-docs .agents/wb/260223_1200_auth-refactor/
```

---

### agents-structure-map.py

Auto-generates project structure documentation.

**Features:**

- Scans project and categorizes files
- Generates markdown with file inventory
- Incremental updates via cache
- Descriptions for each file

**Usage:**

```bash
make structure
# OR
.agents/agents structure-map . --output docs/arc/structure/
# OR
.agents/agents structure-map /path/to/project --output docs/
```

**Output:**

- `README.md` - Overview with metrics
- `frontend.md` - Components, hooks, UI
- `backend.md` - Services, utils, API
- `types.md` - Type definitions
- `tests.md` - Test files
- `data.md` - Data files, constants
- `.structure-cache.json` - Cache for incremental updates

---

### agents-repo-map.py

Runs the full repository codemap pipeline for `docs/map/`.

**Features:**

- Wraps the external `run-repo-map.sh` runner with project-local command semantics
- Resolves output root, Docker image, and runner path deterministically
- Runs analysis against a temporary shadow copy of the repo so generated map artifacts do not self-pollute the scan
- Validates that required root map docs exist after the run
- Keeps full current-state mapping separate from lightweight `structure-map`

**Usage:**

```bash
make repo-map
# OR
.agents/agents repo-map .
# OR
.agents/agents repo-map . --dry-run
```

**Output:**

- `docs/map/*.md` - Distilled repository codemap docs
- `docs/map/extra/` - Raw evidence and machine-readable artifacts

---

### sync-agent-docs.py

Syncs AGENTS.md content to QWEN.md, CLAUDE.md, GEMINI.md.

**Features:**

- Detects local modifications
- Asks before overwriting
- `--force` to overwrite without asking

**Usage:**

```bash
make sync
# OR
.agents/agents sync
# OR
.agents/agents sync --force
```

---

### verify-tasks.py

Verifies all tasks in a session are completed.

**Checks:**

- Task lines with IDs in format `- [ ] T-01 ...` (supports `T-001` too)
- All parsed tasks marked with `- [x]`
- Reports status of each task
- Shows open tasks with `ID | file:line | status | text`
- Returns error if incomplete

**Usage:**

```bash
make verify
# OR
.agents/agents verify-tasks
# OR
.agents/agents verify-tasks .agents/wb/260223_1200_auth-refactor/
```

---

### agents-status.py

Shows current execution state for active or selected workstream session.

**Checks:**

- Resolves canonical artifacts (`plan`, `task`, `spec`, `report`, `roadmap`, `session`)
- Summarizes task progress and identifies next task
- Reuses the artifact manifest to show workflow artifact readiness and blockers
- Exposes blockers and artifact pointers
- Supports `--json` output

**Usage:**

```bash
.agents/agents status
.agents/agents status --session .agents/wb/260306_2128_context-driven-execution-commands
.agents/agents status --session .agents/wb/260306_2128_context-driven-execution-commands --artifact plan --artifact task
```

### agents-session.py

Closes a session after strict verification passes and optionally repoints the active-session pointer.

**Catchup behavior:**

- Summarizes working-tree drift inside and outside the target session
- Flags missing or stale `plan`/`research`/`log`/`report` artifacts
- Recommends the next safe step before implementation continues

**Checks:**

- Runs strict task/workbench verification before closure
- Refuses closure if the session is not in a final, coherent state
- Supports reassigning `.agents/wb/.active_session` to another session

**Usage:**

```bash
.agents/agents session catchup
.agents/agents session catchup --session .agents/wb/260306_2128_context-driven-execution-commands
.agents/agents session catchup --json
.agents/agents session close
.agents/agents session close --session .agents/wb/260306_2128_context-driven-execution-commands
.agents/agents session close --session .agents/wb/260306_2128_context-driven-execution-commands --next-session .agents/wb/260306_2240_session-close-command
```

## Workflow Examples

### Starting New Work

```bash
# 1. Create workstream
make new THEME=auth-refactor SPEC=1

# 2. Edit plan and spec
# Edit .agents/wb/YYMMDD_HHMM_auth-refactor/*_plan_01.md
# Edit .agents/wb/YYMMDD_HHMM_auth-refactor/*_spec_01.md

# 3. Validate
make doctor
```

### During Development

```bash
# 1. Lint docs
make lint

# 2. Update structure if needed
make structure

# 3. Update indexes
make index
```

### Completing Work

```bash
# 1. Verify all tasks done
make verify

# 2. Run full validation
make all

# 3. Sync agent docs
make sync
```

### Full Workflow

```bash
# Complete cycle
make new THEME=feature-x SPEC=1
# ... work ...
make all
```

## UV Setup

### Prerequisites

Install [uv](https://docs.astral.sh/uv/):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Initialize

```bash
make setup
# OR manually
cd .agents/scripts && uv sync
```

This creates:

- `.venv/` - Isolated Python virtualenv
- `uv.lock` - Locked dependencies

## Aliases

| Alias | Full Command |
|-------|--------------|
| `make st` | `make structure` |
| `make ix` | `make index` |
| `make sy` | `make sync` |
| `make vf` | `make verify` |
| `make dr` | `make doctor` |
| `make docs` | `make structure index sync` |
| `make check` | `make doctor lint verify` |
| `make init` | `make setup doctor` |

## Related Documents

- `docs/standards/workflow.md` - General workflow standard
- `docs/standards/verification.md` - Verification standard
- `docs/standards/structure-map.md` - Structure map strategy
- `docs/standards/skills-sync.md` - Universal skills sync standard
- `docs/templates/` - All available templates

---

### agents-wb-update.py

Automates common metadata edits to avoid manual WB file editing.

**Commands:**

- `touch` -> update `updated_at` in session files (supports `--all-wb`)
- `files-changed` -> refresh report `## Files Changed` from git status
- `task` -> mark task by ID (`T-01`/`T-001`) and sync state board row
- `status` -> set frontmatter `status` by doc type
- `timeline` -> append timeline entry in log
- `link` -> set frontmatter `links.<key>` value

**Examples:**

```bash
make wb-touch
make wb-files-changed
make wb-task TASK_ID=T-01 ACTION=done
make wb-status STATUS=final FILE=report
make wb-timeline MSG="Ran full validation"
make wb-link FILE=report KEY=spec VALUE=260223_1855_task-id-standardization_spec-lite_01

# Direct wrapper
.agents/agents wb-update touch --all-wb
.agents/agents wb-update task T-02 --mark-in-progress
```

---

### agents-tools.py

Discovers and validates the tools catalog used by autonomous agents.

**Commands:**

- `list` -> list tools (optional `--type`)
- `info` -> detailed tool metadata and subcommands
- `search` -> keyword lookup across descriptions/usages
- `validate` -> schema/consistency checks for `.agents/tools.json`
- `help` -> CLI help

**Examples:**

```bash
.agents/agents tools list
.agents/agents tools info wb-update
.agents/agents tools search automate
.agents/agents tools validate
make tools-check
```

### Bootstrap Another Repository

```bash
# Required dry-run
./.agents/agents bootstrap /path/to/target-repo --dry-run

# Apply
./.agents/agents bootstrap /path/to/target-repo

# Partial install for an existing project
./.agents/agents bootstrap /path/to/existing-project --partial

# Make wrapper
make bootstrap TARGET=/path/to/target-repo DRY=1
make bootstrap TARGET=/path/to/target-repo
make bootstrap TARGET=/path/to/existing-project PARTIAL=1
```

Bootstrap exports a generic starter state. It does not carry over this scaffold's active `wb/` sessions, knowledge index entries, lesson-entry history, telemetry reports, or live roadmap/spec backlog.
Bootstrap also seeds `.agents/source/universal-skills` from committed repo assets, so the default downstream install path is self-contained.

For an existing project, use `--partial`: files that already exist in the target repo are preserved unless `--force` is used. That makes it safe to add the scaffold to a live codebase without clobbering project-owned files.
If the target repo already defines `make all`, the scaffold preserves that target and exposes its aggregate validation entrypoint as `make agents-all`.

Detailed playbook: `docs/standards/bootstrap-other-repo.md`

---

---

*Standard: `docs/standards/agents-usage.md`*
