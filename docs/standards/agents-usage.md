---
doc_type: standard
id: agents-usage-standard
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-13T19:36:57-03:00'
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

### Using Justfile (Canonical)

```bash
# Show all commands
just help

# Validate structure
just doctor

# Create workstream
just new THEME=auth-refactor

# Full validation
just all
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
- Treat `.agents/wb/.active_session` as a project-local convenience pointer for
  one operator; do not use it as shared synchronization for parallel agents.
- When a shell or wrapper honors the session-context contract, use
  `AGENTS_SESSION_ID=<session-id>` for explicit targeting and
  `AGENTS_SESSION_STRICT=1` for strict session handling.

## Available Commands

### Setup & Maintenance

| Command | Description |
|---------|-------------|
| `just setup` | Initialize UV virtualenv |
| `just clean` | Remove .venv and cache files |
| `just doctor` | Validate .agents structure |

### Documentation

| Command | Description |
|---------|-------------|
| `just structure` | Generate project structure docs |
| `just index` | Update SPECS/ADRS indexes |
| `just sync` | Sync AGENTS.md to agent files |
| `just tools-check` | Validate tools catalog and run tools CLI smoke tests |

### Workflows

| Command | Description | Options |
|---------|-------------|---------|
| `just new` | Create workstream | `THEME=<name>` `SPEC=1\|lite` |
| `just quick` | Reuse active session for small task | `THEME=<name>` |
| `just bootstrap` | Bootstrap .agents system in another repository | `TARGET=/path/to/repo` |
| `just verify` | Check task completion | - |
| `just lint` | Validate markdown docs | - |
| `just skills-init` | Initialize universal skills sync | - |
| `just skills-pull` | Refresh configured external git-backed skills source only | - |
| `just skills-update` | Refresh `.agents/skills/` from the configured git source | `SKILLS=a,b,c`, `RUNTIME=codex`, `PROFILE=x` |
| `just skills-list` | List available or selected upstream skills | `RUNTIME=codex`, `PROFILE=x`, `SELECTED=1`, `INSTALLED=1` |
| `just skills-search` | Search upstream skills by keyword | `QUERY=x`, `RUNTIME=codex`, `PROFILE=x`, `LIMIT=20`, `SELECTED=1` |
| `just skills-plan` | Preview selected skills drift/missing state | `SKILLS=a,b,c` |
| `just skills-apply` | Apply selected skills to `skills/` | `SKILLS=a,b,c` |
| `just skills-ensure` | Ensure one skill into `skills/` | `SKILL=name`, `RUNTIME=codex`, `PROFILE=x`, `PERSIST=1`, `PULL=1` |
| `just skills-push` | Publish selected local skills back to the git-backed source | `SKILL=name` or `SKILLS=a,b`, `COMMIT=1`, `PUSH=1`, `MESSAGE=x` |
| `just skills-status` | Show skills sync status/config | - |
| `just skills-check` | Validate skills structure/sync state | `SKILLS=a,b,c` |
| `just skills-sync` | Refresh `.agents/skills/` from the configured git source | `SKILLS=a,b,c` |
| `just memory-status` | Show configured external-memory provider/boundary | - |
| `just memory-search` | Emit MCP contract for external memory search | `QUERY=x`, `RUNTIME=codex`, `PROJECT=x`, `LIMIT=5` |
| `just memory-context` | Emit MCP contract for memory context expansion | `TOPIC=x`, `RUNTIME=codex`, `PROJECT=x`, `URL=memory://...` |
| `just memory-recent` | Emit MCP contract for recent memory activity | `TIMEFRAME=7d`, `RUNTIME=codex`, `PROJECT=x` |
| `just memory-show` | Emit MCP contract for one memory note | `NOTE=x`, `RUNTIME=codex`, `PROJECT=x` |
| `just wb-touch` | Update `updated_at` in active session docs | - |
| `just wb-normalize-time` | Normalize `created_at`/`updated_at` to configured WB offset | - |
| `just wb-files-changed` | Refresh report `Files Changed` section | - |
| `just wb-task` | Mark task by ID in active session | `TASK_ID=T-01 ACTION=done\|in_progress\|pending\|ready\|blocked\|skipped` |
| `just wb-status` | Set frontmatter status | `STATUS=<value>` `FILE=plan\|task\|spec-lite\|report\|log\|all` (`spec-lite` remains the current compatibility key for child specs) |
| `just wb-timeline` | Append log timeline entry | `MSG=\"text\"` |
| `just wb-link` | Set frontmatter link field | `FILE=<doc>` `KEY=<k>` `VALUE=<v>` |
| `just test-scripts` | Run script unit tests | - |
| `just test-scripts-integration` | Run isolated integration tests | - |
| `just test-scripts-all` | Run unit + integration tests with the 80% scripts coverage gate | - |
| `just agents-all` | Run the full scaffold validation path, including docs, tools, telemetry, runtime tests, and MCP smoke | - |
| `just all` | Alias for `just agents-all` | - |

### Quick Workflows

| Command | Description |
|---------|-------------|
| `just all` | Run full scaffold validation via `just agents-all` |
| `just refresh` | Clean + setup + structure |
| `just docs` | Structure + index + sync |
| `just check` | Doctor + lint + verify |
| `just init` | Setup + doctor |

Bootstrap workflow note:

- Fresh repos use the full bootstrap path.
- Existing repos should use the partial install path so the scaffold adds missing files without overwriting the live project unless `--force` is intentionally supplied.

External memory workflow note:

- Start with repo-local `knowledge` for project history.
- Use `memory` when cross-project or durable external context is still needed.
- Do not treat external memory results as authoritative plan/task/report state for the current repo.

Project-local session workflow:

1. List sessions with `./.agents/agents session list`.
2. Sweep stale or overlapping sessions with `./.agents/agents session sweep`.
3. Use `AGENTS_SESSION_ID=<session-id>` when the shell or wrapper supports an
   explicit session target.
4. Set `AGENTS_SESSION_STRICT=1` when you want strict handling during sweep,
   catchup, or close flows.
5. Catch up a target session before resuming with
   `./.agents/agents session catchup --session <session-id>`.
6. Close only after strict verification passes with
   `./.agents/agents session close --session <session-id>`.
7. Use `--next-session <next-session-id>` only for an intentional handoff to a
   different session.

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
just doctor
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
- Sets `.agents/wb/.active_session` for the local operator fast path

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
- Treat `.agents/wb/.active_session` as a convenience pointer, not a
  parallel-agent synchronization primitive.

**Usage:**

```bash
# Basic delivery (task only by default)
just new THEME=auth-refactor SPEC=lite

# Research-only workstream
just new THEME=auth-investigation INTENT=research

# With full spec
just new THEME=api-endpoint SPEC=1

# With lite spec (legacy compatibility alias for spec-child)
just new THEME=bugfix-login SPEC=lite

# Quick task in current active session
just quick THEME=small-fix

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
just index
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
- Raw codemap evidence under `docs/map/extra/` is excluded from markdown lint

**Usage:**

```bash
just lint
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
just structure
# OR
.agents/agents structure-map . --output docs/map/structure/
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
just repo-map
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

Syncs AGENTS.md content to CLAUDE.md.

**Features:**

- Detects local modifications
- Asks before overwriting
- `--force` to overwrite without asking

**Usage:**

```bash
just sync
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
just verify
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
just new THEME=auth-refactor SPEC=1

# 2. Edit plan and spec
# Edit .agents/wb/YYMMDD_HHMM_auth-refactor/*_plan_01.md
# Edit .agents/wb/YYMMDD_HHMM_auth-refactor/*_spec_01.md

# 3. Validate
just doctor
```

### During Development

```bash
# 1. Lint docs
just lint

# 2. Update structure if needed
just structure

# 3. Update indexes
just index
```

### Completing Work

```bash
# 1. Verify all tasks done
just verify

# 2. Run full validation
just all

# 3. Sync agent docs
just sync
```

### Full Workflow

```bash
# Complete cycle
just new THEME=feature-x SPEC=1
# ... work ...
just all
```

## UV Setup

### Prerequisites

Install [uv](https://docs.astral.sh/uv/):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Initialize

```bash
just setup
# OR manually
cd .agents/scripts && uv sync
```

This creates:

- `.venv/` - Isolated Python virtualenv
- `uv.lock` - Locked dependencies

## Aliases

| Alias | Full Command |
|-------|--------------|
| `just st` | `just structure` |
| `just ix` | `just index` |
| `just sy` | `just sync` |
| `just vf` | `just verify` |
| `just dr` | `just doctor` |
| `just docs` | `just structure index sync` |
| `just check` | `just doctor lint verify` |
| `just init` | `just setup doctor` |

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
just wb-touch
just wb-files-changed
just wb-task TASK_ID=T-01 ACTION=done
just wb-status STATUS=final FILE=report
just wb-timeline MSG="Ran full validation"
just wb-link FILE=report KEY=spec VALUE=260223_1855_task-id-standardization_spec-lite_01

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
just tools-check
```

### Bootstrap Another Repository

```bash
# Required dry-run
./.agents/agents bootstrap /path/to/target-repo --dry-run

# Apply
./.agents/agents bootstrap /path/to/target-repo

# Partial install for an existing project
./.agents/agents bootstrap /path/to/existing-project --partial

# Just wrapper
just bootstrap TARGET=/path/to/target-repo DRY=1
just bootstrap TARGET=/path/to/target-repo
just bootstrap TARGET=/path/to/existing-project PARTIAL=1
```

Bootstrap exports a generic starter state. It does not carry over this scaffold's active `wb/` sessions, knowledge index entries, lesson-entry history, telemetry reports, or live roadmap/spec backlog.
Bootstrap also seeds `.agents/source/universal-skills` from committed repo assets, so the default downstream install path is self-contained.

For an existing project, use `--partial`: files that already exist in the target repo are preserved unless `--force` is used. That makes it safe to add the scaffold to a live codebase without clobbering project-owned files.
If the target repo already defines `just all`, the scaffold preserves that target and exposes its aggregate validation entrypoint as `just agents-all`.

Detailed playbook: `docs/standards/bootstrap-other-repo.md`

---

---

*Standard: `docs/standards/agents-usage.md`*
