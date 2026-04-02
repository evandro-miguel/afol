---
doc_type: standard
id: scripts-reference
theme: standards
status: active
created_at: '2026-02-23T23:37:47-03:00'
updated_at: '2026-04-02T15:21:56-03:00'
---

# Agents System - Quick Reference

## Makefile Commands

### Most Common

```bash
make help          # Show all commands
make doctor        # Validate .agents structure
make new THEME=x   # Create workstream
make structure     # Generate project structure docs
make all           # Full validation workflow (unit + integration, no e2e)
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
| `make verify` | Check task completion across all sessions | - |
| `make verify-session` | Check task completion for one session | `SESSION_ID=<session-id>` |
| `make verify-active` | Check task completion for active session only | - |
| `make lint` | Lint markdown docs | - |
| `make test-scripts` | Run script unit tests | - |
| `make test-scripts-integration` | Run isolated script integration tests | - |
| `make test-scripts-all` | Run script unit + integration tests | - |
| `make skills-init` | Initialize universal skills sync | - |
| `make skills-pull` | Refresh git-backed skills source/mirror only | - |
| `make skills-update` | Refresh `.agents/skills/` from the configured git source | `SKILLS=a,b,c`, `RUNTIME=codex`, `PROFILE=x` |
| `make skills-list` | List available or selected upstream skills | `RUNTIME=codex`, `PROFILE=x`, `SELECTED=1`, `INSTALLED=1` |
| `make skills-search` | Search upstream skills by keyword | `QUERY=x`, `RUNTIME=codex`, `PROFILE=x`, `LIMIT=20`, `SELECTED=1` |
| `make skills-plan` | Preview selected skills drift/missing state | `SKILLS=a,b,c` |
| `make skills-apply` | Apply selected skills to project skills/ | `SKILLS=a,b,c` |
| `make skills-ensure` | Ensure one skill into project skills/ | `SKILL=name`, `RUNTIME=codex`, `PROFILE=x`, `PERSIST=1`, `PULL=1` |
| `make skills-push` | Publish selected local skills back to the git-backed source | `SKILL=name` or `SKILLS=a,b`, `COMMIT=1`, `PUSH=1`, `MESSAGE=x` |
| `make skills-status` | Show skills sync status/config | - |
| `make skills-check` | Validate skills structure and sync state | `SKILLS=a,b,c` |
| `make skills-sync` | One-step refresh of `.agents/skills/` from git source | `SKILLS=a,b,c` |
| `make memory-status` | Show external memory provider and boundary | - |
| `make memory-search` | Emit external memory MCP contract for search | `QUERY=x`, `RUNTIME=codex`, `PROJECT=x`, `LIMIT=5` |
| `make memory-context` | Emit external memory MCP contract for context | `TOPIC=x`, `RUNTIME=codex`, `PROJECT=x`, `URL=memory://...` |
| `make memory-recent` | Emit external memory MCP contract for recent activity | `TIMEFRAME=7d`, `RUNTIME=codex`, `PROJECT=x` |
| `make memory-show` | Emit external memory MCP contract for one note | `NOTE=x`, `RUNTIME=codex`, `PROJECT=x` |
| `make wb-touch` | Update `updated_at` in one session docs | `SESSION_ID=<session-id>` `[FILE=<path>]` |
| `make wb-normalize-time` | Normalize WB timestamps to configured offset | - |
| `make wb-files-changed` | Refresh report `Files Changed` from git | `SESSION_ID=<session-id>` or `REPORT=<report-file>` |
| `make wb-task` | Mark task by ID in one session | `SESSION_ID=<session-id>` `TASK_ID=T-01 ACTION=done\|in_progress\|pending\|ready\|blocked\|skipped` |
| `make wb-status` | Set frontmatter status in one session docs | `SESSION_ID=<session-id>` `STATUS=<value>` `FILE=plan\|task\|spec-lite\|report\|log\|all` |
| `make wb-timeline` | Append timeline entry in one session log | `SESSION_ID=<session-id>` `MSG=\"text\"` |
| `make wb-link` | Set `links.<key>` in one session doc frontmatter | `SESSION_ID=<session-id>` `FILE=<doc>` `KEY=<k>` `VALUE=<v>` |
| `make all` | Full scaffold validation (includes `test-scripts-all`) | - |
| `make refresh` | Clean + setup + structure | - |

### Aliases

| Alias | Full Command |
|-------|--------------|
| `make st` | `make structure` |
| `make ix` | `make index` |
| `make sy` | `make sync` |
| `make vf` | `make verify` |
| `make va` | `make verify-active` |
| `make dr` | `make doctor` |
| `make docs` | `make structure index sync` |
| `make check` | `make doctor lint verify-active` |
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
.agents/agents structure-map . --output docs/arc/structure/
.agents/agents repo-map .
.agents/agents status --session <session-id>
.agents/agents memory status
.agents/agents memory search "agent memory" --runtime codex
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

### Optional External Memory

```bash
make memory-status
make memory-search QUERY="persistent planning memory" RUNTIME=codex
make memory-context TOPIC="persistent planning memory" RUNTIME=codex
make memory-show NOTE="projects/260311-basic-memory-implementation/current-state"
```

The `memory` command family is contract-only in the scaffold:
- it emits exact MCP server/tool/argument guidance for interactive runtimes
- it does not execute MCP calls from shell
- it complements repo-local `knowledge` instead of replacing canonical workbench state

---
*Reference: `.agents/scripts/QUICKSTART.md`*


### Bootstrap in Another Repo

```bash
./.agents/agents bootstrap /path/to/target-repo --dry-run
./.agents/agents bootstrap /path/to/target-repo
./.agents/agents bootstrap /path/to/existing-project --partial
```

Bootstrap writes a generic baseline for the target repo and intentionally omits scaffold-local `wb/` history, generated knowledge indexes, telemetry reports, and the scaffold's own roadmap/spec backlog.
Bootstrap also copies `PLANS.md` so the target repo inherits the canonical ExecPlan contract.
Bootstrap seeds `.agents/source/universal-skills` from committed repo assets, so the default downstream install path does not require a network clone.
Use the partial install path for already-live projects so existing files remain intact and the bootstrap only fills missing scaffold surface.
The skills baseline is intentionally generic here; the upstream universal-skills contract should evolve without turning bootstrap into a second skills distribution system.

For an existing project, use `--partial`. The installer preserves files that already exist unless `--force` is used. If the target repo already owns `make all`, use `make agents-all` for the scaffold's aggregate validation target.

See: `docs/standards/bootstrap-other-repo.md`


### Skills Sync

```bash
make skills-init
make skills-pull
make skills-list RUNTIME=codex
make skills-search QUERY=markdown RUNTIME=codex
make skills-sync SKILLS=writing-skills,markdownlint-skill
make skills-push SKILL=writing-skills COMMIT=1
make skills-ensure SKILL=writing-skills RUNTIME=codex
make skills-check
```

`make skills-pull` refreshes the git-backed source or git mirror only. Use `make skills-sync` or `make skills-update` when you want `.agents/skills/` refreshed too.

See: `docs/standards/skills-sync.md`
