# Agents System - Quick Reference

## Makefile Commands

### Most Common

```bash
make help          # Show all commands
make doctor        # Validate .agents structure
make new THEME=x   # Create workstream
make structure     # Generate project structure docs
make all           # Full validation workflow
```

### Complete List

| Command | Description | Options |
|---------|-------------|---------|
| `make help` | Show help message | - |
| `make setup` | Initialize UV virtualenv | - |
| `make doctor` | Validate structure | - |
| `make clean` | Remove temp files | - |
| `make structure` | Generate structure docs | - |
| `make index` | Update SPECS/ADRS indexes | - |
| `make sync` | Sync AGENTS.md files | - |
| `make tools-check` | Validate tools catalog + CLI smoke tests | - |
| `make new` | Create workstream | `THEME=<name>` `SPEC=1\|lite` |
| `make bootstrap` | Bootstrap .agents system in another repository | `TARGET=/path/to/repo` |
| `make verify` | Check task completion | - |
| `make lint` | Lint markdown docs | - |
| `make wb-touch` | Update `updated_at` in active session docs | - |
| `make wb-normalize-time` | Normalize WB timestamps to configured offset | - |
| `make wb-files-changed` | Refresh report `Files Changed` from git | - |
| `make wb-task` | Mark task by ID in active session | `TASK_ID=T-01 ACTION=done\|in_progress\|pending\|ready\|blocked\|skipped` |
| `make wb-status` | Set frontmatter status in active session docs | `STATUS=<value>` `FILE=plan\|task\|spec-lite\|report\|log\|all` |
| `make wb-timeline` | Append timeline entry in active session log | `MSG=\"text\"` |
| `make wb-link` | Set `links.<key>` in active session doc frontmatter | `FILE=<doc>` `KEY=<k>` `VALUE=<v>` |
| `make all` | Full validation | - |
| `make refresh` | Clean + setup + structure | - |

### Aliases

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

## Examples

### Create New Workstream

```bash
# Basic (plan + task + log)
make new THEME=auth-refactor

# With full spec
make new THEME=api-endpoint SPEC=1

# With lite spec
make new THEME=bugfix-login SPEC=lite
```

### Generate Documentation

```bash
# Generate structure docs for current project
make structure

# Update all indexes
make index

# Sync AGENTS.md to agent files
make sync

# All docs workflow
make docs
```

### Validation

```bash
# Quick validation
make doctor

# Full validation
make all

# Check only
make check
```

## Wrapper CLI

Alternative to Makefile:

```bash
.agents/agents help
.agents/agents doctor
.agents/agents new auth-refactor --spec
.agents/agents structure-map . --output .agents/arc/structure/
```

## UV Scripts

Direct UV usage:

```bash
uv run --with pyyaml .agents/scripts/agents-doctor.py
uv run --with pyyaml .agents/scripts/agents-new.py my-feature --spec
```

## Project Config

All scripts use `.agents/agents.config` as single source of configuration.
Legacy fallback: `agents.config` at repository root.

---

*Reference: `.agents/scripts/QUICKSTART.md`*

### Bootstrap in Another Repo

```bash
./.agents/agents bootstrap /path/to/target-repo --dry-run
./.agents/agents bootstrap /path/to/target-repo
```

See: `.agents/a-docs/standards/bootstrap-other-repo.md`
