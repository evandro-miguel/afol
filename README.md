# .agents - Agentic Workflow System

Operating system for agentic LLM workflows with automated telemetry and element heat scoring.

Primary supported runtimes: OpenCode, Codex, and Qwen.

## 🎯 Overview

`.agents` is a standardized system for managing LLM-assisted development workflows, focused on:

- **Consistent documentation** - Standardized templates for plans, tasks, reports
- **Planning rigor** - Brainstorm and explorer-check gates for major plans
- **Knowledge reuse** - Low-token search over prior research, reports, and postmortems
- **Automated telemetry** - Tracks tool, pattern, and document usage without manual intervention
- **Heat scoring** - Identifies hot/cold elements by period (daily, weekly, monthly)
- **Pattern catalog** - Catalog of patterns and anti-patterns with automatic suggestions
- **Self-improvement** - Lessons learned system after each correction

## 📁 Repository Structure

```
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
├── a-docs/                  # Documentation only
│   ├── telemetry/           # Telemetry docs
│   │   ├── README.md
│   │   ├── HEAT_SCORING.md
│   │   └── dashboard.md
│   ├── patterns/            # Pattern catalog
│   │   ├── INDEX.md
│   │   ├── success/
│   │   ├── anti/
│   │   └── templates/
│   ├── lessons/             # Lessons learned
│   ├── templates/           # Doc templates
│   └── arc/                 # Architecture
│
├── wb/                      # Active workstreams
│   ├── .active_session      # Current session
│   └── YYMMDD_HHMM_theme/   # Session folders
│
├── tmp/                     # Temporary non-canonical artifacts
│
├── rules/                   # Operational rules
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
# 1. Define or update the roadmap feature in .agents/arc/GENERAL-ROADMAP.md

# 2. Define or update the governing parent spec in .agents/arc/SPECS/

# 3. Create the workstream with mandatory governance linkage
.agents/agents new auth-refactor --feature-id F-01 --parent-spec 260306_roadmap-first-delivery-system_spec_01 --spec-lite

# Optional: add a pack for another major track inside an existing session
.agents/agents new api-follow-up --feature-id F-07 --parent-spec 260306_execution-intelligence-and-knowledge-system_spec_01 --pack api-cleanup --into-session 260306_2002_execution-intelligence-system --spec

# Quick task in active session
.agents/agents new update-docs --quick
```

### Runtime Entry Points

- `AGENTS.md` is the canonical instruction source.
- `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, and `GEMINI.md` are runtime-facing mirrors generated from it.
- `opencode.json` is the committed OpenCode project adapter and must remain secret-free.
- Runtime folders such as `.opencode/`, `.codex/`, and `.qwen/` should only contain project-safe adapters and docs.

### 3. Work

```bash
# Reuse prior findings before deep exploration when relevant
.agents/agents knowledge search runtime
.agents/agents knowledge pull runtime

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
- if a defect is found and fixed, add a lesson entry in `.agents/a-docs/lessons/entries/`

## 🔥 Automated Telemetry

### What's Tracked (Automatically)

| Event | When | Source |
|-------|------|--------|
| `tool_exec` | Every `.agents/agents <tool>` attempt | `.agents/agents` wrapper |
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

**Score = (frequency × 0.5) + (recency × 0.3) + (success × 0.2)**

- 🔴 **Hot** (70-100): Heavily used in period
- 🟡 **Warm** (40-69): Moderate usage
- 🔵 **Cold** (0-39): Rarely used in period

### Heat Map Example

```
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

- `plan.md` - Workstream planning
- `task.md` - Task list with IDs
- `log.md` - Decision timeline
- `report.md` - Outcome report
- `spec.md` / `spec-lite.md` - Local workstream refinements chosen as needed
- `brainstorm.md` - Ideation
- `explorer-check.md` - Current-project exploration proof
- `research.md` - Research
- `postmortem.md` - Mandatory final session closure artifact

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
make doctor         # Validate .agents structure
make clean          # Clean caches
make all            # Bootstrap-safe full validation
```

### Workflows

```bash
make new THEME=x FEATURE_ID=F-01 PARENT_SPEC=<spec-id>  # Create governed workstream
make quick THEME=x  # Quick task
make verify         # Verify tasks
make lint           # Lint markdown
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
.agents/agents new <theme> --feature-id F-01 --parent-spec <spec-id>  # Create workstream
.agents/agents verify-tasks     # Verify tasks
.agents/agents status           # Show session status
.agents/agents wb-update touch  # Update session
.agents/agents tools list       # List tools
.agents/agents structure-map .  # Map structure

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

# Investigate: obsolete? new? forgotten?
```

## 🎓 Core Principles

1. **Simplicity first** - Minimal necessary change
2. **Root cause first** - No temporary fixes
3. **Minimal blast radius** - Touch only what's needed
4. **Deterministic verification** - Evidence over assumptions
5. **Documentation consistency** - Templates and patterns aligned

## 📖 Documentation

- `.agents/a-docs/telemetry/README.md` - Telemetry guide
- `.agents/a-docs/telemetry/HEAT_SCORING.md` - Heat scoring details
- `.agents/a-docs/patterns/INDEX.md` - Pattern catalog
- `.agents/a-docs/lessons/` - Lessons learned

## 🤝 Contributing

1. Create workstream: `.agents/agents new feature-x --feature-id F-01 --parent-spec <spec-id> --spec-lite`
2. Follow templates from `a-docs/templates/`
3. Apply relevant patterns
4. Validate: `make lint && make test-scripts && make all`
5. Report: `make wb-files-changed`

## 📄 License

MIT

---

**Status:** ✅ Production  
**Last updated:** 2026-02-23  
**Version:** 1.0.0
