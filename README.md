# .agents - Agentic Workflow System

<!-- markdownlint-disable MD013 -->

Operating system for interactive agentic CLI workflows with automated telemetry and element heat scoring.

Primary supported runtimes: OpenCode, Codex, Qwen, Gemini CLI, and Claude Code style interactive agents.

## 🎯 Overview

`.agents` is a standardized system for managing LLM-assisted development workflows, focused on:

- **Consistent documentation** - Standardized templates for plans, tasks, reports
- **Planning rigor** - Brainstorm and explorer-check gates for major plans
- **Knowledge reuse** - Low-token search over prior research, reports, and postmortems
- **Automated telemetry** - Tracks tool, pattern, and document usage without manual intervention
- **Heat scoring** - Identifies hot/cold elements by period (daily, weekly, monthly)
- **Pattern catalog** - Catalog of patterns and anti-patterns with automatic suggestions
- **Self-improvement** - Lessons learned system after each correction

This scaffold is built for interactive, terminal-first agent sessions. It is not positioned as an application SDK for embedding long-lived agent runtimes into backend services.

## 📁 Repository Structure

```text
docs/
├── arc/                     # Roadmap, specs, decisions, structure canon
├── map/                     # Current-state repository map and analysis evidence
├── standards/               # Canonical process and command standards
├── templates/               # Reusable doc and workbench templates
├── telemetry/               # Telemetry docs and reports
├── patterns/                # Pattern catalog and anti-patterns
├── knowledge/               # Indexed knowledge summaries
└── lessons/                 # Lessons learned

.agents/
├── scripts/                 # Operational scripts
│   ├── agents-telemetry.py  # Telemetry and heat scoring
│   ├── agents-patterns.py   # Pattern catalog
│   ├── agents-new.py        # Creates workstreams
│   ├── agents-doctor.py     # Validates structure
│   └── ...
│
├── data/                    # Operational data
│   └── telemetry/
│       ├── events.jsonl     # Telemetry events
│       └── schemas/
│           └── event.json   # Event schema
│
├── wb/                      # Active workstreams
│   ├── .active_session      # Current session
│   └── YYMMDD_HHMM_theme/   # Session folders
│
├── tmp/                     # Temporary non-canonical artifacts
│
├── rules/                   # Operational rules
├── runtime/                 # Central Python runtime and FastMCP adapter
├── skills/                  # Project skills
└── tools.json               # Tool catalog
```

## 🚀 Quick Start

### 1. Initial Validation

```bash
# Validate .agents structure
make doctor

# List available tools
.agents/agents tools list
```

### 2. Create Workstream

```bash
# 1. Define or update the roadmap feature in docs/arc/GENERAL-ROADMAP.md

# 2. Define or update the governing parent spec in docs/arc/SPECS/

# 3. Create the workstream with mandatory governance linkage
.agents/agents new auth-refactor --feature-id F-01 --parent-spec 260306_roadmap-first-delivery-system_spec_01 --spec-lite
# `--spec-lite` is the current CLI compatibility flag while `spec-child` is the canonical future doc name.

# Research-only workstream
.agents/agents new auth-investigation --feature-id F-02 --parent-spec 260306_roadmap-first-delivery-system_spec_01 --intent research

# The same theme would also infer `research` safely if --intent is omitted

# Governed planning workstream (seeds brainstorm + explorer-check + plan by default)
.agents/agents new planning-track --feature-id F-07 --parent-spec 260306_execution-intelligence-and-knowledge-system_spec_01 --intent planning

# Optional: add a pack for another major track inside an existing session
.agents/agents new api-follow-up --feature-id F-07 --parent-spec 260306_execution-intelligence-and-knowledge-system_spec_01 --pack api-cleanup --into-session 260306_2002_execution-intelligence-system --spec

# Quick task in active session
.agents/agents new update-docs --quick
```

### Bootstrap Another Repo

```bash
# Full bootstrap for a new or mostly empty repo
# The target directory is created automatically if it does not exist yet.
./.agents/agents bootstrap /path/to/target-repo

# Partial install for an existing project with live content
./.agents/agents bootstrap /path/to/existing-project --partial

# Bootstrap prepares a repo-local upstream source checkout at
# .agents/source/universal-skills inside the target repository.
# The default bootstrap path seeds that source from committed repo assets,
# so downstream installs do not need a network clone.
```

### Runtime Entry Points

- `AGENTS.md` is the canonical instruction source.
- `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, and `GEMINI.md` are runtime-facing mirrors generated from it.
- `opencode.json` is the committed OpenCode project adapter and must remain secret-free.
- Runtime folders such as `.opencode/`, `.codex/`, and `.qwen/` should only contain project-safe adapters and docs.
- Project-owned documentation belongs under `docs/`; `.agents/` is reserved for agent-system surfaces such as workbench, skills, telemetry, and runtime automation.
- The scaffold should be optimized for interactive CLI agent execution paths first; embedded SDK/server use cases are secondary and should not drive the default structure.
- Bootstrap exports a generic, history-free baseline for downstream repos and supports a partial install mode that preserves existing project-owned files.
- The exported baseline keeps current-state repository mapping in `docs/map/` and avoids publishing repo-map artifacts inside `.agents/`.
- The skills baseline is treated as an adoption artifact, not as scaffold-local history; downstream repos should pin their own selection and evolve it from there.

### Skills Source and Discovery

```bash
# Show the active upstream source checkout and manifest state
./.agents/agents skills-sync status

# List available upstream skills from the configured external catalog when available,
# otherwise from the repo-local source seed.
./.agents/agents skills-sync list --runtime codex

# Search by keyword across skill names and SKILL.md content
./.agents/agents skills-sync search markdown --runtime codex

# One-step update from the configured source into .agents/skills/
./.agents/agents skills-sync sync --runtime codex

# Ensure the scaffold-operating skill is installed locally
./.agents/agents skills-sync ensure agentic-folder-sys --runtime codex --pull

# Propose upstream skill changes through a branch/PR; never push to main.
./.agents/agents skills-sync push agentic-folder-sys --branch skills-sync/agentic-folder-sys --commit --push --pr
```

- Preferred repo-local source seed: `.agents/source/universal-skills` inside the repo root. It must not be a nested git checkout.
- Optional external catalog: set `AGENTS_UNIVERSAL_SKILLS_SOURCE` or `skills_sync.external_source_dir` to a separate universal-skills checkout when the full upstream catalog or Git refresh is needed.
- Bootstrap seeds `.agents/source/universal-skills` from committed repo skills by default.
- `skills-sync list` and `skills-sync search` prefer the configured external catalog when present; otherwise they use the repo-local source seed.
- `skills-sync pull` refreshes only an external git checkout; it does not clone into `.agents/cache/` and does not overwrite `.agents/skills/` by itself.
- `skills-sync sync` and `skills-sync update` are the simple one-step paths to refresh `.agents/skills/` from the configured source.
- `skills-sync push` is a branch/PR proposal flow. It requires an external universal-skills checkout and refuses direct pushes to `main`.
- Keep `agentic-folder-sys` installed locally so agents have a canonical operational skill for scaffold bootstrap, upgrade, validation, git-backed skills flow, and governed workbench sessions.
- The scaffold should not depend on global Codex skills for universal-skills content.
- Prefer repo-local skills under `.agents/skills/`; keep Codex global skills lean and project-agnostic.

### Optional External Memory

```bash
# Show the configured external-memory provider and boundary rules
./.agents/agents memory status

# Emit the exact MCP contract for a cross-project memory search
./.agents/agents memory search "agent memory mcp integration" --runtime codex

# Emit the exact MCP contract for contextual expansion around a topic
./.agents/agents memory context "persistent planning memory" --runtime codex
```

- `memory` is a governed adapter for interactive runtimes, not a shell-side MCP executor.
- Use repo-local `knowledge` first, then `memory`, then targeted repo rereads when needed.
- External memory remains auxiliary; `.agents/wb/` and repo-local `knowledge` stay canonical.

### 3. Work

```bash
# Reuse prior findings before deep exploration when relevant
.agents/agents knowledge search runtime
.agents/agents knowledge pull runtime

# If configured, emit exact MCP contracts for cross-project memory lookup
.agents/agents memory search "agent memory"
.agents/agents memory context "session catchup"

# Use tools (automatic telemetry)
.agents/agents doctor
.agents/agents verify
.agents/agents structure

# View heat map of what's being used
make telemetry-heat PERIOD=daily
```

### 4. Complete

```bash
# Verify complete tasks
.agents/agents verify

# Catch up the active session before resuming after a gap
.agents/agents session catchup --session <session-id>

# Finalize postmortem before closing the session report
.agents/agents wb-update status --session <session-id> --file postmortem --value final
.agents/agents wb-update status --session <session-id> --file report --value final

# Close the verified session and optionally move the active pointer
.agents/agents session close --session <session-id>
.agents/agents session close --session <session-id> --next-session <next-session-id>

# Generate report
make wb-files-changed

# View session telemetry
make telemetry-report PERIOD=weekly
```

### Documentation Currency (Required)

Before ending work, close the documentation loop first:

- update all affected management artifacts in the active session (`plan`, `task`, `log`, `report`)
- align impacted specs/roadmap entries and standards/standards templates
- refresh runtime mirrors if canonical behavior changed
- keep required metadata updates (`updated_at`) automation-driven
- if a defect is found and fixed, add a lesson entry in `docs/lessons/entries/`

## 🔥 Automated Telemetry

### What's Tracked (Automatically)

| Event | When | Source |
|-------|------|--------|
| `tool_exec` | Every `.agents/agents <tool>` attempt | `.agents/agents` wrapper and runtime registry delegate |
| `session_start` | Creating workstream | `agents-new.py` |
| `pattern_applied` | Applying pattern | `agents-patterns.py` |
| `session_end` | Finalizing a session report, or touching a session whose report is already final | `agents-wb-update.py` |

### Heat Scoring by Period

Heat score identifies most/least used elements:

```bash
# Heat map this week
make telemetry-heat PERIOD=weekly

# Hottest elements (top 10)
make telemetry-hot

# Coldest elements (top 10)
make telemetry-cold

# By type
make telemetry-heat TYPE=patterns PERIOD=monthly
```

Score formula: (frequency × 0.5) + (recency × 0.3) + (success × 0.2)

- 🔴 **Hot** (70-100): Heavily used in period
- 🟡 **Warm** (40-69): Moderate usage
- 🔵 **Cold** (0-39): Rarely used in period

### Heat Map Example

```text
======================================================================
🔥 HEAT MAP - Element Usage & Engagement (weekly)
======================================================================
Period: 2026-02-16 → 2026-02-23

Total Elements: 6
Total Accesses: 37
🔴 Hot (score >= 70): 1
🟡 Warm (score 40-69): 5
🔵 Cold (score < 40): 0
Avg Heat Score: 60.6

TOOLS
----------------------------------------------------------------------
Element                      Score    Level   Access     Last    Success
----------------------------------------------------------------------
🔴 tools                      100.0      hot       29   0d ago 29/29 (100%)
🟡 doctor                      53.4     warm        2   0d ago 2/2 (100%)
```

## 📚 Pattern Catalog

Catalog of patterns and anti-patterns with automatic suggestions.

### Pattern Types

| Type | Location | Purpose |
|------|----------|---------|
| **Success** | `patterns/success/` | Proven approaches |
| **Anti** | `patterns/anti/` | What to avoid |
| **Tool** | `patterns/tools/` | Tool effectiveness |
| **Template** | `patterns/templates/` | Template patterns |

### Commands

```bash
# Suggest patterns for theme
make patterns-suggest THEME=auth-refactor

# List patterns
make patterns-list

# Show pattern details
make patterns-show PATTERN_ID=PAT-001

# Apply pattern (records in telemetry)
make patterns-apply PATTERN_ID=PAT-001
```

### Included Patterns

- **PAT-001**: Discovery-First Tool Usage (success)
- **PAT-002**: Single Active Session (success)
- **PAT-101**: Workbench Sprawl (anti-pattern)

## 📝 Documentation

### Available Templates

- `plan.md` - Workstream ExecPlan (living execution document)
- `task.md` - Task list with IDs
- `log.md` - Decision timeline
- `report.md` - Outcome report
- `spec.md` / `spec-child.md` - Local workstream refinements chosen as needed
- `spec-lite.md` - Legacy compatibility alias for `spec-child`
- `spec-test.md` - Journey-first testing strategy artifact before test implementation
- `brainstorm.md` - Ideation when real option analysis happened
- `explorer-check.md` - Current-project exploration proof when repo inspection is needed
- `research.md` - Research when durable findings are needed
- `postmortem.md` - Final session closure artifact when a real outcome exists

### ExecPlans

- Non-trivial work should use the workbench plan as a living ExecPlan.
- The canonical contract lives in `PLANS.md`.
- The canonical file path is `.agents/wb/<session_id>/<session_id>_plan_01.md`.
- Finalized plans are strictly verified for required ExecPlan sections and maintained `Progress`.

### Required Frontmatter

Every `.md` must have:

```yaml
---
doc_type: task
id: "YYMMDD_HHMM_theme_task_01"
theme: "auth-refactor"
status: active
created_at: "2026-02-23T00:00:00-03:00"
updated_at: "2026-02-23T00:00:00-03:00"
---
```

### Task Markers

```markdown
- [ ] T-01 Pending
- [/] T-02 In progress
- [%] T-03 Ready for test
- [!] T-04 Blocked
- [>] T-05 Skipped
- [x] T-06 Completed
```

## 🛠️ Makefile Targets

### Setup & Validation

```bash
make setup          # Setup UV virtualenv
make setup-runtime  # Setup central runtime environment
make doctor         # Validate .agents structure
make clean          # Clean caches
make lint-scripts   # Lint Python operational scripts
make lint-runtime   # Lint central runtime package
make test-runtime   # Run central runtime tests
make runtime-mcp-smoke # Smoke runtime and MCP CLIs
make all            # Bootstrap-safe full validation (unit + integration, no e2e)
```

### Workflows

```bash
make new THEME=x FEATURE_ID=F-01 PARENT_SPEC=<spec-id>  # Create governed workstream
make quick THEME=x  # Quick task
make verify         # Verify tasks
make lint           # Lint markdown, excluding tmp workspaces
make structure      # Generate structure
make index          # Update indexes
make sync           # Sync AGENTS.md
```

### Telemetry

```bash
make telemetry-heat     # Heat map
make telemetry-hot      # Hot elements
make telemetry-cold     # Cold elements
make telemetry-report   # Weekly report
make telemetry-export   # Export data
make telemetry-validate # Validate schema
```

### Patterns

```bash
make patterns-suggest   # Suggest patterns
make patterns-list      # List patterns
make patterns-show      # Pattern details
make patterns-apply     # Apply pattern
make patterns-rate      # Rate pattern
```

## 📊 .agents Commands

```bash
# Main tools
.agents/agents doctor           # Validate structure
.agents/agents new <theme> --feature-id F-01 --parent-spec <spec-id>  # Create minimal delivery workstream (task by default)
.agents/agents new <theme> --feature-id F-01 --parent-spec <spec-id> --intent planning  # Create governed planning bundle (brainstorm + explorer-check + plan)
.agents/agents verify-tasks     # Verify tasks
.agents/agents status           # Show session status + workflow artifact readiness
.agents/agents wb-update touch  # Update session
.agents/agents bootstrap /path/to/target-repo --dry-run  # Preview generic export to another repo
.agents/agents bootstrap /path/to/existing-project --partial  # Partial install for a live repo
make agents-all  # Aggregate scaffold validations when local Makefile already owns `all`
.agents/agents tools list       # List tools
.agents/agents structure-map .  # Map structure
.agents/agents repo-map .       # Refresh full repository codemap
.agents/agents runtime manifest # Generate central runtime manifest
.agents/agents runtime validate # Validate scaffold through central runtime
.agents/agents mcp serve        # Run FastMCP server over stdio
.agents/agents-mcp manifest     # Compatibility launcher for MCP-oriented commands

# Telemetry
.agents/agents telemetry heat   # Heat map
.agents/agents telemetry hot    # Hot elements
.agents/agents telemetry cold   # Cold elements
.agents/agents telemetry report # Report

# Patterns
.agents/agents patterns suggest # Suggest patterns
.agents/agents patterns apply   # Apply pattern
```

## 🔧 Configuration

File: `.agents/agents.config`

```yaml
time:
  default_offset: "+00:00"
  wb_offset: "-03:00"

telemetry:
  enabled: true
  data_dir: ".agents/data/telemetry"
  auto_record_sessions: true
  retention_days: 90

patterns:
  enabled: true
  auto_suggest: true
```

## 📈 Use Cases

### Sprint with Gaps

```bash
# What was hot during sprint?
make telemetry-heat PERIOD=weekly

# What's hot today?
make telemetry-heat PERIOD=daily

# Detect gap: daily << weekly
```

### Retrospective

```bash
# Export sprint heat
make telemetry-heat PERIOD=weekly FORMAT=json > sprint.json

# Analyze patterns used
jq '.patterns | sort_by(.heat_score) | reverse' sprint.json
```

### Investigate Cold Elements

```bash
# Cold tools this month
make telemetry-cold PERIOD=monthly TYPE=tools
```

## 🎓 Core Principles

1. **Simplicity first** - Minimal necessary change
2. **Root cause first** - No temporary fixes
3. **Minimal blast radius** - Touch only what's needed
4. **Deterministic verification** - Evidence over assumptions
5. **Documentation consistency** - Templates and patterns aligned

## 📖 Documentation

- `docs/telemetry/README.md` - Telemetry guide
- `docs/telemetry/HEAT_SCORING.md` - Heat scoring details
- `docs/patterns/INDEX.md` - Pattern catalog
- `docs/lessons/` - Lessons learned

## 🤝 Contributing

1. Create only the workstream artifacts you need: `.agents/agents new feature-x --feature-id F-01 --parent-spec <spec-id> --spec-lite` (`--spec-lite` remains the current compatibility flag for `spec-child`)
2. Follow templates from `docs/templates/`
3. Apply relevant patterns
4. Validate: `make all`
5. Report: `make wb-files-changed`

## 📄 License

MIT

---

**Status:** ✅ Production  
**Last updated:** 2026-02-23  
**Version:** 1.0.0
