---
doc_type: standard
id: scripts-usage
theme: standards
status: active
created_at: '2026-02-23T23:37:47-03:00'
updated_at: '2026-05-04T16:08:30-03:00'
---

# Scripts Usage

**Main documentation:** See `docs/standards/agents-usage.md`

This document contains detailed script documentation.

## Quick Reference

### Using Justfile (Canonical)

```bash
# Show all commands
just help

# Setup (first time)
just setup-uv
just setup

# Validate structure
just doctor

# Create workstream
just new THEME=auth-refactor

# Generate structure docs
just structure

# Full validation
just all

# Lint fixes
just lint-fix          # Fix common issues
just lint-fix-dry      # Preview fixes
just lint-fix-check    # Check for issues
just lint-fix-checkboxes  # Fix checkbox separators
just lint-fix-frontmatter # Add missing frontmatter

# Tests
just test-scripts      # Run unit tests
just test-scripts-all  # Run unit + integration tests with the 80% scripts coverage gate
just lint-scripts      # Lint Python code

# Workbench updates
just wb-touch          # Update timestamps
just wb-evidence SESSION_ID=<id> TASK_ID=T-01 CMD="just verify-strict" RESULT="passed" ARTIFACT=.agents/wb/<id>/<id>_report_01.md
just wb-task SESSION_ID=<id> TASK_ID=T-01 ACTION=done EVIDENCE_ID=E-...  # Mark task done with ledger evidence
```

### Using Wrapper

```bash
.agents/agents help
.agents/agents doctor
.agents/agents new auth-refactor --spec
.agents/agents wb-update touch
.agents/agents wb-update evidence T-01 --session <id> --command "just verify-strict" --result "passed"
.agents/agents tools list
.agents/agents benchmark list
.agents/agents benchmark run live-implement-next-governance-preflight --save
.agents/agents telemetry heat --period weekly
.agents/agents status
.agents/agents implement next
.agents/agents review
.agents/agents revert task --session <session-id> --task-id <T-xx>
.agents/agents session catchup --session <session-id>
.agents/agents session close --session <session-id>
```

The wrapper routes public commands through the runtime command registry, which
currently delegates to the existing `.agents/scripts/` command bodies for
compatibility. Use `.agents/agents runtime command-registry` to inspect the
registered public aliases.

`uv` stays on the setup path and runtime launch path, but it is materialized as
a project-local tool under `.agents/tools/uv/bin/uv`. UV cache writes are
redirected to `.agents/cache/uv/`.

## Setup (One Time)

### Prerequisites

Prepare project-local `uv`:

```bash
./.agents/agents hydrate-uv
```

### Initialize Local Runtime

```bash
./.agents/agents hydrate
```

This creates:

- `.agents/tools/uv/python/` - Project-local managed CPython install
- `.agents/scripts/.venv/` - Script virtualenv
- `.agents/runtime/.venv/` - Runtime virtualenv
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
.agents/agents structure-map . --output docs/map/structure/

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
.agents/tools/uv/bin/uv run --with pyyaml .agents/scripts/agents-doctor.py
.agents/tools/uv/bin/uv run --with pyyaml .agents/scripts/agents-new.py auth-refactor --spec
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

Creates or extends a workstream with only the artifacts justified by the selected intent.

**Creates:**

- Session folder with proper naming
- Only the artifacts justified by the chosen `--intent`
- Optional spec file (`--spec` or `--spec-lite`; `--spec-lite` is the current compatibility alias while docs move to `spec-child`)

**Catalog + policy contract:**

- The artifact order is declared in `.agents/agents.config` under `workflow.artifact_manifest`.
- The manifest is an ordered `artifacts:` list with `doc_type`, `template`, `phase`, `purpose`, optional `depends_on`, and optional flag metadata.
- `workflow.artifact_policy` defines which artifacts each intent creates by default.
- The default `delivery` flow now creates only `task`; `plan`, `report`, and `postmortem` are materialized only when explicitly requested or justified.
- The default `planning` flow now creates `brainstorm`, `explorer-check`, and `plan`; use `--plan-only` or narrower intents when intentionally staying lightweight.
- When `--intent` is omitted, obvious themes such as `investigation`, `brainstorm`, `explore`, and `postmortem` are inferred into a safer non-delivery intent.
- The same catalog + policy is reused by `agents-status.py` to report workflow artifact readiness and invalid placeholder-only artifacts.

**Usage:**

```bash
python .agents/scripts/agents-new.py <theme>
python .agents/scripts/agents-new.py auth-refactor --spec
python .agents/scripts/agents-new.py bugfix-login --spec-lite
python .agents/scripts/agents-new.py investigate-auth --intent research
python .agents/scripts/agents-new.py quick-fix --plan-only
```

`--spec-lite` remains the current CLI flag for compatibility with historical workbench naming. Canonical governance wording now refers to this child-spec artifact as `spec-child`.

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

### agents-benchmark.py

Runs the controlled live-agent runtime-flow benchmark family for risky scaffold
execution changes as selective development-time regression validation.

**Default benchmark profile:**

- `runtime=codex`
- `model=gpt-5.4-mini`
- `reasoning_effort=medium`

**Core metrics:**

- overall and per-scenario `pass` / `fail`
- duration in milliseconds
- retries and error counts
- tool success count and success rate
- `context_bytes` from declared fixture artifacts
- observed tool calls and required command matching
- `checks_total`, `checks_passed`, and `accuracy`

**Usage:**

```bash
python .agents/scripts/agents-benchmark.py list
python .agents/scripts/agents-benchmark.py show live-implement-next-governance-preflight
python .agents/scripts/agents-benchmark.py run
python .agents/scripts/agents-benchmark.py run live-implement-start-complete-evidence --save
python .agents/scripts/agents-benchmark.py run live-wb-update-task-evidence-timeline --save
python .agents/scripts/agents-benchmark.py run live-tools-benchmark-discovery --output .agents/data/benchmarks/results/manual.json
```

This runner uses isolated temporary fixture repos so benchmark scenarios do not
mutate the live workbench session of the current repository.

Use it for targeted regression checks after risky changes, not as a daily
production workflow.

---

### agents-lint-docs.py

Validates markdown docs for consistency.

**Checks:**

- Checkbox markers are consistent (`- [X]` format)
- Status fields are valid
- State values are valid
- Required frontmatter fields exist
- Cross-references are valid
- Temporary folders such as `.agents/tmp/`, `.tmp/`, and repo-local `tmp/` are always excluded
- Raw codemap evidence under `docs/map/extra/` is excluded from markdown lint

**Usage:**

```bash
python .agents/scripts/agents-lint-docs.py
python .agents/scripts/agents-lint-docs.py .agents/wb/260223_1200_auth-refactor/
python .agents/scripts/agents-lint-docs.py .agents/wb --fix
```

---

### sync-agent-docs.py

Syncs AGENTS.md content to CLAUDE.md.

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
python .agents/scripts/agents-structure-map.py /path/to/project --output docs/map/structure/
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
- Reuses the artifact manifest to surface workflow artifact readiness and blockers
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
- For governed sessions under `.agents/wb/`, the command now loads and prints
  the active feature/spec/rule bundle before task transitions proceed.

**Usage:**

```bash
python .agents/scripts/agents-implement.py next
python .agents/scripts/agents-implement.py start --task-id T-01
python .agents/scripts/agents-implement.py complete --task-id T-01 --command "just test-scripts" --result "passed"
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

Session context:

- `.agents/wb/.active_session` is a project-local convenience pointer for one
  operator, not a safe synchronization primitive for parallel agents.
- `AGENTS_SESSION_ID=<session-id>` is the explicit session target for shells
  or wrappers that honor the session-context contract.
- `AGENTS_SESSION_STRICT=1` requests strict session handling during sweep,
  catchup, and close flows.

**Behavior:**

- `list` reports project-local sessions under `.agents/wb/`
- `sweep` performs a read-only project-local stale/open/close-candidate scan
- `catchup` reports working-tree drift, stale or missing artifacts, and the next safe resume step
- Runs `verify-tasks.py --strict` for the target session
- Refuses closure if strict verification fails
- Optionally repoints the convenience pointer with `--next-session`
- Clears the convenience pointer when the closed session was active and no
  `--next-session` was supplied

Project-local workflow:

1. List local sessions with `list`.
2. Sweep stale or overlapping sessions with `sweep`.
3. Catch up the target session with `catchup --session <session-id>` before
   resuming work.
4. Close with `close --session <session-id>` only after strict verification
   passes.
5. Use `--next-session <next-session-id>` only for an intentional handoff.

**Usage:**

```bash
python .agents/scripts/agents-session.py list
python .agents/scripts/agents-session.py list --json
python .agents/scripts/agents-session.py sweep
python .agents/scripts/agents-session.py sweep --json
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
