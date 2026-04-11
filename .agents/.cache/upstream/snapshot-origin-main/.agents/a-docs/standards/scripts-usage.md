# Scripts Usage

**Main documentation:** See `.agents/a-docs/standards/agents-usage.md`

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
```

### Using Wrapper

```bash
.agents/agents help
.agents/agents doctor
.agents/agents new auth-refactor --spec
```

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
.agents/agents new auth-refactor --spec

# Generate structure docs
.agents/agents structure-map . --output .agents/arc/structure/

# Verify tasks
.agents/agents verify-tasks .agents/wb/260223_1200_auth-refactor/
```

### With UV Directly

```bash
# Uses temporary environment with pyyaml
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

- `.agents/arc/SPECS/` for spec files
- `.agents/arc/DECISIONS/` for adr files

**Updates:**

- `.agents/arc/SPECS/INDEX.md`
- `.agents/arc/DECISIONS/INDEX.md`

**Usage:**

```bash
python .agents/scripts/agents-index.py
python .agents/scripts/agents-index.py --dry-run
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
python .agents/scripts/agents-structure-map.py /path/to/project --output .agents/arc/structure/
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
