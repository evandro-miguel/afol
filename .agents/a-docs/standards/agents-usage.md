---
doc_type: standard
id: "agents-usage-standard"
status: active
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
---

# Agents System Usage

## Overview

This document describes how to use the `.agents/` operational system.

## Central Configuration

All scripts load settings from `.agents/agents.config` (preferred).
Legacy fallback: `agents.config` in the repository root.
Use this file to adjust paths, timezone offsets, lint exclusions, doctor requirements, and sync targets for each project.

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
```

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
| `make verify` | Check task completion | - |
| `make lint` | Validate markdown docs | - |
| `make wb-touch` | Update `updated_at` in active session docs | - |
| `make wb-normalize-time` | Normalize `created_at`/`updated_at` to configured WB offset | - |
| `make wb-files-changed` | Refresh report `Files Changed` section | - |
| `make wb-task` | Mark task by ID in active session | `TASK_ID=T-01 ACTION=done\|in_progress\|pending\|ready\|blocked\|skipped` |
| `make wb-status` | Set frontmatter status | `STATUS=<value>` `FILE=plan\|task\|spec-lite\|report\|log\|all` |
| `make wb-timeline` | Append log timeline entry | `MSG=\"text\"` |
| `make wb-link` | Set frontmatter link field | `FILE=<doc>` `KEY=<k>` `VALUE=<v>` |

### Quick Workflows

| Command | Description |
|---------|-------------|
| `make all` | Run full validation (doctor + structure + index + verify) |
| `make refresh` | Clean + setup + structure |
| `make docs` | Structure + index + sync |
| `make check` | Doctor + lint + verify |
| `make init` | Setup + doctor |

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

Creates new workstream with all required files.

**Creates:**
- Session folder with proper naming
- Plan file
- Task file
- Spec file (optional)
- Log file
- Sets `.agents/wb/.active_session`

**Policy:**
- One active workstream at a time
- Use `--quick` for non-significant tasks (no new folder)
- Use `--force-new` only for significant new streams

**Usage:**
```bash
# Basic (plan + task + log)
make new THEME=auth-refactor SPEC=lite

# With full spec
make new THEME=api-endpoint SPEC=1

# With lite spec
make new THEME=bugfix-login SPEC=lite

# Quick task in current active session
make quick THEME=small-fix

# Direct
.agents/agents new auth-refactor --spec
.agents/agents new api-endpoint --spec-lite
.agents/agents new tiny-fix --quick
.agents/agents new major-refactor --force-new --spec
```

---

### agents-index.py

Updates INDEX.md files for SPECS and ADRs.

**Scans:**
- `.agents/arc/SPECS/` for spec files
- `.agents/arc/DECISIONS/` for adr files

**Updates:**
- `.agents/arc/SPECS/INDEX.md`
- `.agents/arc/DECISIONS/INDEX.md`

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
.agents/agents structure-map . --output .agents/arc/structure/
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

- `.agents/a-docs/standards/workflow.md` - General workflow standard
- `.agents/a-docs/standards/verification.md` - Verification standard
- `.agents/a-docs/standards/structure-map.md` - Structure map strategy
- `.agents/a-docs/templates/` - All available templates

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

---
*Standard: `.agents/a-docs/standards/agents-usage.md`*
