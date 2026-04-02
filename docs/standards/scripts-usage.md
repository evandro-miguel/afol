---
doc_type: standard
id: scripts-usage
theme: standards
status: active
created_at: '2026-02-23T23:37:47-03:00'
updated_at: '2026-03-07T18:19:40-03:00'
---

# Scripts Usage

**Main documentation:** See `docs/standards/agents-usage.md`

This document contains detailed script documentation.

## Quick Reference

### Using Makefile (Recommended)

```bash
# Show all commands
make help

# Setup (first time)
make setup

# Validate structure
make doctor

# Create workstream
make new THEME=auth-refactor

# Generate structure docs
make structure

# Full validation
make all

# Lint fixes
make lint-fix          # Fix common issues
make lint-fix-dry      # Preview fixes
make lint-fix-check    # Check for issues
make lint-fix-checkboxes  # Fix checkbox separators
make lint-fix-frontmatter # Add missing frontmatter

# Tests
make test-scripts      # Run unit tests
make lint-scripts      # Lint Python code

# Workbench updates
make wb-touch          # Update timestamps
make wb-evidence SESSION_ID=<id> TASK_ID=T-01 CMD="make verify-strict" RESULT="passed"
make wb-task TASK_ID=T-01 ACTION=done EVIDENCE_ID=E-...  # Mark task done with evidence
```

### Using Wrapper

```bash
.agents/agents help
.agents/agents doctor
.agents/agents new auth-refactor --spec
.agents/agents wb-update touch
.agents/agents wb-update evidence T-01 --session <id> --command "make verify-strict" --result "passed"
.agents/agents tools list
.agents/agents telemetry heat --period weekly
.agents/agents status
.agents/agents implement next
.agents/agents review
.agents/agents revert task --session <session-id> --task-id <T-xx>
.agents/agents session catchup --session <session-id>
.agents/agents session close --session <session-id>
```

The wrapper uses the local `.agents/scripts/.venv` interpreter directly when available.
`uv` stays on the setup path only, and UV cache writes are redirected to `.agents/cache/uv/`.

## Setup (One Time)

### Prerequisites

Install [uv](https://docs.astral.sh/uv/):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Initialize Virtualenv

```bash
cd .agents/scripts
uv sync
```

This creates:
- `.venv/` - Isolated Python virtualenv
- `uv.lock` - Locked dependencies

## Usage

### With Wrapper (Recommended)

```bash
# Show help
.agents/agents help

# Validate structure
.agents/agents doctor

# Create new workstream
.agents/agents doctor

# Create new workstream
.agents/agents new auth-refactor --spec

# Generate structure docs
.agents/agents structure-map . --output docs/arc/structure/

# Verify tasks
.agents/agents verify-tasks .agents/wb/260223_1200_auth-refactor/

# Show session status
.agents/agents status --session .agents/wb/260306_2128_context-driven-execution-commands

# Catch up a session before resuming work
.agents/agents session catchup --session .agents/wb/260306_2128_context-driven-execution-commands

# Emit the exact MCP contract for external memory usage
.agents/agents memory search "agent memory" --runtime codex
```

### With UV Directly

```bash
# For setup/bootstrap or direct script execution outside the wrapper
uv run --with pyyaml .agents/scripts/agents-doctor.py
uv run --with pyyaml .agents/scripts/agents-new.py auth-refactor --spec
```

### With Python (Not Recommended)

```bash
# Requires manual pip install pyyaml
python .agents/scripts/agents-doctor.py
```

## Available scripts

### agents-doctor.py
Validates `.agents` folder structure and integrity.

**Checks:**
- Required folders exist
- Templates are present
- YAML frontmatter is valid
- IDs follow naming convention
- Timestamps are ISO 8601 with Z suffix
- Cross-links between docs are valid

**Usage:**
```bash
python .agents/scripts/agents-doctor.py
python .agents/scripts/agents-doctor.py --fix
```

---

### agents-new.py
Creates new workstream with all required files.

**Creates:**
- Session folder with proper naming
- Plan file
- Task file
- Spec file (optional: `--spec` or `--spec-lite`)
- Log file

**Usage:**
```bash
python .agents/scripts/agents-new.py <theme>
python .agents/scripts/agents-new.py auth-refactor --spec
python .agents/scripts/agents-new.py bugfix-login --spec-lite
python .agents/scripts/agents-new.py quick-fix --plan-only
```

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
python .agents/scripts/agents-index.py
python .agents/scripts/agents-index.py --dry-run
```

---

### agents-memory.py
Resolves the configured external-memory provider and emits deterministic MCP contracts for interactive runtimes.

**Notes:**
- Contract-only: does not execute MCP tool calls from shell
- Intended for auxiliary retrieval, not canonical project state
- Complements repo-local `knowledge` instead of replacing it

**Usage:**
```bash
python .agents/scripts/agents-memory.py status
python .agents/scripts/agents-memory.py search "agent memory" --runtime codex
python .agents/scripts/agents-memory.py context "persistent planning memory" --runtime codex
python .agents/scripts/agents-memory.py recent --timeframe 7d
python .agents/scripts/agents-memory.py show projects/260311-basic-memory-implementation/current-state
```

---

### agents-lint-docs.py
Validates markdown docs for consistency.

**Checks:**
- Checkbox markers are consistent (`- [X]` format)
- Status fields are valid
- State values are valid
- Required frontmatter fields exist
- Cross-references are valid

**Usage:**
```bash
python .agents/scripts/agents-lint-docs.py
python .agents/scripts/agents-lint-docs.py .agents/wb/260223_1200_auth-refactor/
python .agents/scripts/agents-lint-docs.py .agents/wb --fix
```

---

### sync-agent-docs.py
Syncs AGENTS.md content to QWEN.md, CLAUDE.md, GEMINI.md.

**Features:**
- Detects local modifications
- Asks before overwriting
- `--force` to overwrite without asking

**Usage:**
```bash
python .agents/scripts/sync-agent-docs.py
python .agents/scripts/sync-agent-docs.py --force
```

---

### verify-tasks.py
Verifies all tasks in a session are completed.

**Checks:**
- All tasks marked with `- [x]`
- Reports status of each task
- Returns error if incomplete

**Usage:**
```bash
python .agents/scripts/verify-tasks.py .agents/wb/260223_1200_auth-refactor/
python .agents/scripts/verify-tasks.py .
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
python .agents/scripts/agents-structure-map.py .
python .agents/scripts/agents-structure-map.py /path/to/project --output docs/arc/structure/
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
Generates or refreshes the full repository codemap under `docs/map/`.

**Features:**
- Wraps the external `docker-analisys-tools` runner in a scaffold-native command
- Supports deterministic `repo`, `output`, `runner`, and `image` resolution
- Runs the analysis in a temporary shadow repo and syncs the generated output back into the configured map root
- Fails if required root codemap docs are missing after the run

**Usage:**
```bash
python .agents/scripts/agents-repo-map.py .
python .agents/scripts/agents-repo-map.py . --dry-run
python .agents/scripts/agents-repo-map.py . --runner /path/to/run-repo-map.sh
```

**Output:**
- `docs/map/*.md` - Current-state codemap docs
- `docs/map/extra/` - Raw evidence from the analysis pipeline

---

### agents-status.py
Displays current execution state for the active or explicitly-selected session.

**Features:**
- Resolves key canonical artifacts (`plan`, `task`, `spec`, `report`, `roadmap`)
- Shows total/done progress with next task and blockers
- Supports artifact-only output via `--artifact`
- Optional JSON mode with `--json`

**Usage:**
```bash
python .agents/scripts/agents-status.py
python .agents/scripts/agents-status.py --session .agents/wb/260306_2128_context-driven-execution-commands
python .agents/scripts/agents-status.py --json
python .agents/scripts/agents-status.py --artifact plan --artifact task
python .agents/scripts/agents-status.py --artifact product --artifact guidelines --artifact tech-stack
```

---

### agents-implement.py
Executes guided task transitions.

**Commands:***
- `next`: show the next active task
- `start`: move a task to `in_progress`
- `complete`: mark a task done and write a lightweight evidence record

**Usage:**
```bash
python .agents/scripts/agents-implement.py next
python .agents/scripts/agents-implement.py start --task-id T-01
python .agents/scripts/agents-implement.py complete --task-id T-01 --command "make test-scripts" --result "passed"
```

### agents-review.py
Checks plan/task/report constraints and prints severity-classified findings.

**Usage:**
```bash
python .agents/scripts/agents-review.py --session .agents/wb/260306_2128_context-driven-execution-commands
python .agents/scripts/agents-review.py --scope verify
```

### agents-revert.py
Reverts logical units by scope (`task`, `phase`, `pack`, `session`).

Mutating scopes require an explicit `--confirm`. Without it, the command prints a summary and exits without changing files.

**Usage:**
```bash
python .agents/scripts/agents-revert.py task --task-id T-04 --to-state pending --confirm
python .agents/scripts/agents-revert.py phase --phase P-01 --confirm
python .agents/scripts/agents-revert.py session --confirm
```

### agents-session.py
Summarizes catchup/resume state and closes a session only after strict verification succeeds.

**Behavior:**
- `catchup` reports working-tree drift, stale or missing artifacts, and the next safe resume step
- Runs `verify-tasks.py --strict` for the target session
- Refuses closure if strict verification fails
- Optionally repoints `.agents/wb/.active_session` with `--next-session`
- Leaves the active pointer unchanged by default

**Usage:**
```bash
python .agents/scripts/agents-session.py catchup
python .agents/scripts/agents-session.py catchup --session .agents/wb/260306_2128_context-driven-execution-commands
python .agents/scripts/agents-session.py catchup --json
python .agents/scripts/agents-session.py close
python .agents/scripts/agents-session.py close --session .agents/wb/260306_2128_context-driven-execution-commands
python .agents/scripts/agents-session.py close --session .agents/wb/260306_2128_context-driven-execution-commands --next-session .agents/wb/260306_2240_session-close-command
python .agents/scripts/agents-session.py close --json
```

## Workflow

### Starting new work
```bash
# 1. Create workstream
python .agents/scripts/agents-new.py my-feature --spec

# 2. Edit plan and spec
# Edit .agents/wb/YYMMDD_HHMM_my-feature/*_plan_01.md
# Edit .agents/wb/YYMMDD_HHMM_my-feature/*_spec_01.md

# 3. Run doctor to validate
python .agents/scripts/agents-doctor.py
```

### During work
```bash
# 1. Lint docs
python .agents/scripts/agents-lint-docs.py .agents/wb/YYMMDD_HHMM_my-feature/

# 2. Update index if created specs/adrs
python .agents/scripts/agents-index.py
```

### Completing work
```bash
# 1. Verify all tasks done
python .agents/scripts/verify-tasks.py .agents/wb/YYMMDD_HHMM_my-feature/

# 2. Run full doctor check
python .agents/scripts/agents-doctor.py
```

---

## Dependencies

Some scripts require PyYAML for full functionality:

```bash
pip install pyyaml
```

Scripts will work without it but with reduced validation.

---
*Scripts folder: `.agents/scripts/`*
