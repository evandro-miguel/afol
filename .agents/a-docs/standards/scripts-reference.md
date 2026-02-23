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
| `make new` | Create workstream | `THEME=<name>` `SPEC=1\|lite` |
| `make verify` | Check task completion | - |
| `make lint` | Lint markdown docs | - |
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

---
*Reference: `.agents/scripts/QUICKSTART.md`*
