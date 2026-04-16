---
doc_type: standard
id: scripts-reference
theme: standards
status: active
created_at: '2026-02-23T23:37:47-03:00'
updated_at: '2026-04-13T19:37:02-03:00'
---

# Agents System - Quick Reference

## Justfile Commands

### Most Common

```bash
just help          # Show all commands
just doctor        # Validate .agents structure
just new THEME=x   # Create workstream
just structure     # Generate project structure docs
just agents-all    # Full scaffold validation workflow
just all           # Alias for just agents-all
```

### Complete List

| Command | Description | Options |
|---------|-------------|---------|
| `just help` | Show help message | - |
| `just setup` | Initialize UV virtualenv | - |
| `just doctor` | Validate structure | - |
| `just clean` | Remove temp files | - |
| `just structure` | Generate structure docs | - |
| `just index` | Update SPECS/ADRS indexes | - |
| `just sync` | Sync AGENTS.md files | - |
| `just tools-check` | Validate tools catalog + CLI smoke tests | - |
| `just new` | Create workstream | `THEME=<name>` `SPEC=1\|lite` |
| `just bootstrap` | Bootstrap .agents system in another repository | `TARGET=/path/to/repo` |
| `just verify` | Check task completion across all sessions | - |
| `just verify-session` | Check task completion for one session | `SESSION_ID=<session-id>` |
| `just verify-active` | Check task completion for active session only | - |
| `just lint` | Lint markdown docs | - |
| `just test-scripts` | Run script unit tests | - |
| `just test-scripts-integration` | Run isolated script integration tests | - |
| `just test-scripts-all` | Run script unit + integration tests with the 80% scripts coverage gate | - |
| `just skills-init` | Initialize universal skills sync | - |
| `just skills-pull` | Refresh configured external git-backed skills source only | - |
| `just skills-update` | Refresh `.agents/skills/` from the configured git source | `SKILLS=a,b,c`, `RUNTIME=codex`, `PROFILE=x` |
| `just skills-list` | List available or selected upstream skills | `RUNTIME=codex`, `PROFILE=x`, `SELECTED=1`, `INSTALLED=1` |
| `just skills-search` | Search upstream skills by keyword | `QUERY=x`, `RUNTIME=codex`, `PROFILE=x`, `LIMIT=20`, `SELECTED=1` |
| `just skills-plan` | Preview selected skills drift/missing state | `SKILLS=a,b,c` |
| `just skills-apply` | Apply selected skills to project skills/ | `SKILLS=a,b,c` |
| `just skills-ensure` | Ensure one skill into project skills/ | `SKILL=name`, `RUNTIME=codex`, `PROFILE=x`, `PERSIST=1`, `PULL=1` |
| `just skills-push` | Publish selected local skills back to the git-backed source | `SKILL=name` or `SKILLS=a,b`, `COMMIT=1`, `PUSH=1`, `MESSAGE=x` |
| `just skills-status` | Show skills sync status/config | - |
| `just skills-check` | Validate skills structure and sync state | `SKILLS=a,b,c` |
| `just skills-sync` | One-step refresh of `.agents/skills/` from git source | `SKILLS=a,b,c` |
| `just memory-status` | Show external memory provider and boundary | - |
| `just memory-search` | Emit external memory MCP contract for search | `QUERY=x`, `RUNTIME=codex`, `PROJECT=x`, `LIMIT=5` |
| `just memory-context` | Emit external memory MCP contract for context | `TOPIC=x`, `RUNTIME=codex`, `PROJECT=x`, `URL=memory://...` |
| `just memory-recent` | Emit external memory MCP contract for recent activity | `TIMEFRAME=7d`, `RUNTIME=codex`, `PROJECT=x` |
| `just memory-show` | Emit external memory MCP contract for one note | `NOTE=x`, `RUNTIME=codex`, `PROJECT=x` |
| `just wb-touch` | Update `updated_at` in one session docs | `SESSION_ID=<session-id>` `[FILE=<path>]` |
| `just wb-normalize-time` | Normalize WB timestamps to configured offset | - |
| `just wb-files-changed` | Refresh report `Files Changed` from git | `SESSION_ID=<session-id>` or `REPORT=<report-file>` |
| `just wb-task` | Mark task by ID in one session | `SESSION_ID=<session-id>` `TASK_ID=T-01 ACTION=done\|in_progress\|pending\|ready\|blocked\|skipped` |
| `just wb-status` | Set frontmatter status in one session docs | `SESSION_ID=<session-id>` `STATUS=<value>` `FILE=plan\|task\|spec-lite\|report\|log\|all` (`spec-lite` is the current compatibility key for child specs) |
| `just wb-timeline` | Append timeline entry in one session log | `SESSION_ID=<session-id>` `MSG=\"text\"` |
| `just wb-link` | Set `links.<key>` in one session doc frontmatter | `SESSION_ID=<session-id>` `FILE=<doc>` `KEY=<k>` `VALUE=<v>` |
| `just agents-all` | Full scaffold validation (`doctor`, `structure`, `index`, `knowledge-index`, `sync`, markdown/script/runtime lint, skills/tools/telemetry checks, script coverage gate, runtime tests, and MCP smoke) | - |
| `just all` | Alias for `just agents-all` | - |
| `just refresh` | Clean + setup + structure | - |

### Aliases

| Alias | Full Command |
|-------|--------------|
| `just st` | `just structure` |
| `just ix` | `just index` |
| `just sy` | `just sync` |
| `just vf` | `just verify` |
| `just va` | `just verify-active` |
| `just dr` | `just doctor` |
| `just docs` | `just structure index sync` |
| `just check` | `just doctor lint verify-active` |
| `just init` | `just setup doctor` |

## Examples

### Create New Workstream

```bash
# Basic minimal delivery (task only by default)
just new THEME=auth-refactor

# With full spec
just new THEME=api-endpoint SPEC=1

# With lite spec (legacy compatibility alias for spec-child)
just new THEME=bugfix-login SPEC=lite
```

`SPEC=lite` remains the current CLI compatibility option while governance docs use `spec-child` as the canonical future artifact name.

### Generate Documentation

```bash
# Generate structure docs for current project
just structure

# Update all indexes
just index

# Sync AGENTS.md to agent files
just sync

# All docs workflow
just docs
```

### Validation

```bash
# Quick validation
just doctor

# Full validation
just all

# Check only
just check
```

## Wrapper CLI

Just wrapper entrypoint:

```bash
.agents/agents help
.agents/agents doctor
.agents/agents new auth-refactor --spec
.agents/agents structure-map . --output docs/map/structure/
.agents/agents repo-map .
.agents/agents status --session <session-id>
.agents/agents runtime command-registry
.agents/agents memory status
.agents/agents memory search "agent memory" --runtime codex
```

Public wrapper aliases route through the runtime command registry and remain
compatibility delegates while individual commands are ported to native runtime
services.

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
just memory-status
just memory-search QUERY="persistent planning memory" RUNTIME=codex
just memory-context TOPIC="persistent planning memory" RUNTIME=codex
just memory-show NOTE="projects/260311-basic-memory-implementation/current-state"
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
Bootstrap copies `docs/templates/plan.md` as the reusable ExecPlan starter for target repos.
Bootstrap seeds `.agents/source/universal-skills` from committed repo assets, so the default downstream install path does not require a network clone.
Use the partial install path for already-live projects so existing files remain intact and the bootstrap only fills missing scaffold surface.
The skills baseline is intentionally generic here; the upstream universal-skills contract should evolve without turning bootstrap into a second skills distribution system.

For an existing project, use `--partial`. The installer preserves files that already exist unless `--force` is used. If the target repo already owns `just all`, use `just agents-all` for the scaffold's aggregate validation target.

See: `docs/standards/bootstrap-other-repo.md`

### Skills Sync

```bash
just skills-init
just skills-pull
just skills-list RUNTIME=codex
just skills-search QUERY=markdown RUNTIME=codex
just skills-sync SKILLS=agentic-folder-sys
just skills-push SKILL=agentic-folder-sys COMMIT=1
just skills-ensure SKILL=agentic-folder-sys RUNTIME=codex
just skills-check
```

`just skills-pull` refreshes only a configured external git-backed source. It never creates `.agents/cache/universal-skills`. Use `just skills-sync` or `just skills-update` when you want `.agents/skills/` refreshed too.

See: `docs/standards/skills-sync.md`
