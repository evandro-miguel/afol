# .agents System Operations Rule

**ID:** RULE-001  
**Version:** 1.0  
**Created:** 2026-02-23  
**Applies to:** All agents (QWEN, CLAUDE, GEMINI)  
**Scope:** Working with .agents tooling, folders, linting, and documentation

---

## Purpose

This rule defines **mandatory operational standards** for all agents working with the `.agents` system. Following this rule ensures:

- Consistent workstream creation
- Proper tool usage
- Documentation quality
- Linting compliance
- Folder structure integrity

---

## 1. Tool Discovery (MANDATORY FIRST STEP)

### Before Starting Any Work

```bash
# ALWAYS discover available tools first
./.agents/agents tools list

# Search for specific capability
./.agents/agents tools search <keyword>

# Get detailed info about a tool
./.agents/agents tools info <tool-id>
```

### Tool Categories

| Category | Tools | When to Use |
|----------|-------|-------------|
| `validation` | `doctor`, `lint-docs` | Before commits, after changes |
| `creation` | `new` | Starting new feature/bugfix |
| `documentation` | `index`, `structure-map` | After creating specs/ADRs |
| `verification` | `verify-tasks` | Before marking workstream complete |
| `automation` | `wb-update` | Low-value repetitive tasks |
| `synchronization` | `sync` | After updating AGENTS.md |
| `discovery` | `tools` | When unsure which tool to use |

### Tool Usage Pattern

```
1. Discover → .agents/agents tools list
2. Learn    → .agents/agents tools info <tool-id>
3. Read     → .agents/a-docs/agentic/<tool>.md
4. Execute  → .agents/agents <command> [args]
5. Verify   → Check output and exit code
```

---

## 2. Workstream Creation

### Creating New Workstream

```bash
# Standard workstream (plan + task + log)
./.agents/agents new <theme-name>

# With full specification
./.agents/agents new <theme-name> --spec

# With lite specification
./.agents/agents new <theme-name> --spec-lite

# Via Makefile
make new THEME=<theme-name>
```

### Naming Conventions

| Element | Pattern | Example |
|---------|---------|---------|
| Session folder | `YYMMDD_HHMM_<theme>` | `260223_1800_auth-refactor` |
| Plan file | `*_plan_NN.md` | `260223_1800_auth-refactor_plan_01.md` |
| Task file | `*_task_NN.md` | `260223_1800_auth-refactor_task_01.md` |
| Log file | `*_log_NN.md` | `260223_1800_auth-refactor_log_01.md` |
| Spec file | `*_spec_NN.md` | `260223_1800_auth-refactor_spec_01.md` |
| Task IDs | `T-NN` (2-3 digits) | `T-01`, `T-02`, `T-10` |

### Task Status Markers

```markdown
- [ ] T-01 Description      # pending
- [/] T-02 Description      # in_progress
- [%] T-03 Description      # ready_for_test
- [!] T-04 Description      # blocked
- [>] T-05 Description      # skipped
- [x] T-06 Description      # completed
```

---

## 3. Folder Structure

### Required Folders

```
.agents/
├── agents.config           # Central configuration (YAML)
├── tools.json              # Tool catalog (JSON)
├── agents                  # CLI wrapper (bash)
├── a-docs/
│   ├── templates/          # Document templates
│   ├── standards/          # Human-readable standards
│   ├── agentic/            # Tool documentation for agents
│   ├── lessons/            # Lessons learned
│   └── specs/              # Specifications
├── arc/
│   ├── SPECS/              # Technical specifications
│   ├── DECISIONS/          # Architecture decisions (ADRs)
│   └── structure/          # Auto-generated structure docs
├── wb/                     # Workstreams (sessions)
│   ├── .active_session     # Pointer to current session
│   └── YYMMDD_HHMM_<theme>/
├── scripts/
│   ├── agents-*.py         # Tool scripts
│   └── lib/
│       └── agents_config.py
└── rules/                  # Agent rules (this folder)
```

### Configuration Files

| File | Purpose | Format |
|------|---------|--------|
| `.agents/agents.config` | Central config | YAML |
| `.agents/tools.json` | Tool catalog | JSON |
| `.agents/wb/.active_session` | Session pointer | Text |

---

## 4. Documentation Standards

### Frontmatter (MANDATORY)

Every `.md` file MUST have YAML frontmatter:

```yaml
---
id: T-01
theme: auth-refactor
type: task
status: in_progress
owner: agent-name
created_at: 2026-02-23T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  plan: 260223_1800_auth-refactor_plan_01.md
  spec: 260223_1800_auth-refactor_spec_01.md
---
```

### Required Fields by Type

| Type | Required Fields |
|------|-----------------|
| `plan` | id, theme, type, status, owner, created_at, updated_at |
| `task` | id, theme, type, status, owner, created_at, updated_at |
| `log` | id, theme, type, status, owner, created_at, updated_at |
| `spec` | id, theme, type, status, owner, created_at, updated_at |
| `report` | id, theme, type, status, owner, created_at, updated_at, links.files_changed |

### Status Values

```yaml
status: draft       # Initial state
status: active      # Currently working
status: review      # Ready for review
status: approved    # Approved
status: final       # Final version
status: done        # Completed
status: blocked     # Blocked by dependency
status: deprecated  # No longer recommended
status: superseded  # Replaced by newer version
```

### Timeline Entries (Log Files)

```markdown
## Timeline

- [2026-02-23T10:00:00-03:00] Started implementation
- [2026-02-23T11:30:00-03:00] Completed core logic
- [2026-02-23T14:00:00-03:00] Added tests
```

---

## 5. Linting & Validation

### Before Every Commit

```bash
# Validate structure
./.agents/agents doctor
# OR
make doctor

# Lint documentation
./.agents/agents lint-docs .agents/wb/
# OR
make lint

# Verify tasks complete
./.agents/agents verify-tasks .agents/wb/<session>/
# OR
make verify
```

### Full Validation

```bash
# Run all validations
make all
# Equivalent to: doctor + structure + index + verify
```

### Fixing Issues

```bash
# Auto-fix lint issues (when possible)
./.agents/agents lint-docs .agents/wb --fix

# Update WB metadata
./.agents/agents wb-update touch
./.agents/agents wb-update normalize-time --all-wb
```

### Validation Checklist

- [ ] All required folders exist
- [ ] All templates present
- [ ] Frontmatter YAML valid
- [ ] IDs follow convention (YYMMDD_HHMM_theme_type_N)
- [ ] Timestamps in ISO 8601 with timezone
- [ ] Task markers correct (- [x], - [/], - [ ])
- [ ] Status values valid
- [ ] Cross-links valid

---

## 6. Tool-Specific Guidelines

### agents-doctor

```bash
# When: Before starting work, after structural changes
./.agents/agents doctor

# Exit codes:
# 0 = All valid
# 1 = Errors found
```

### agents-new

```bash
# When: Starting new feature, bugfix, investigation
./.agents/agents new <theme> [--spec|--spec-lite]

# Creates: plan.md, task.md, log.md, (optional: spec.md)
# Updates: .agents/wb/.active_session
```

### agents-wb-update

```bash
# Update timestamp
./.agents/agents wb-update touch

# Mark task complete
./.agents/agents wb-update task T-01 --mark-done

# Mark task in progress
./.agents/agents wb-update task T-02 --mark-in-progress

# Set document status
./.agents/agents wb-update status --value active --file plan

# Add timeline entry
./.agents/agents wb-update timeline --message "Implementation started"

# Update files changed in report
./.agents/agents wb-update files-changed
```

### agents-index

```bash
# When: After creating spec.md or adr.md
./.agents/agents index

# Updates: .agents/arc/SPECS/INDEX.md, .agents/arc/DECISIONS/INDEX.md
```

### sync-agent-docs

```bash
# When: After updating AGENTS.md
./.agents/agents sync

# Syncs: AGENTS.md → QWEN.md, CLAUDE.md, GEMINI.md
```

---

## 7. Workflow Patterns

### Standard Workflow

```bash
# 1. Discover tools (if new agent)
./.agents/agents tools list

# 2. Create workstream
./.agents/agents new feature-name --spec
# OR
make new THEME=feature-name

# 3. Work on tasks
# Edit files, implement changes

# 4. Update workbench
./.agents/agents wb-update touch
./.agents/agents wb-update task T-01 --mark-done

# 5. Validate
./.agents/agents doctor
./.agents/agents lint-docs .agents/wb/
./.agents/agents verify-tasks .agents/wb/<session>/

# 6. Generate docs (if applicable)
./.agents/agents index
./.agents/agents structure-map .

# 7. Full validation
make all
```

### Quick Task Workflow

```bash
# For small tasks in active session
./.agents/agents new "Quick task description" --quick

# Mark complete
./.agents/agents wb-update task T-XX --mark-done
```

### Bug Fix Workflow

```bash
# 1. Create workstream with lite spec
./.agents/agents new bugfix-description --spec-lite

# 2. Investigate and document
# Edit spec-lite.md with findings

# 3. Implement fix
# Mark tasks complete

# 4. Validate
make verify
```

---

## 8. Documentation Locations

| Documentation Type | Location |
|-------------------|----------|
| Tool documentation | `.agents/a-docs/agentic/` |
| Human standards | `.agents/a-docs/standards/` |
| Templates | `.agents/a-docs/templates/` |
| Lessons learned | `.agents/a-docs/lessons/` |
| Architecture | `.agents/arc/` |
| Structure docs | `.agents/arc/structure/` |
| Specifications | `.agents/arc/SPECS/` |
| Decisions (ADRs) | `.agents/arc/DECISIONS/` |

---

## 9. Configuration

### agents.config

```yaml
# Central configuration file
# Location: .agents/agents.config

paths:
  agents_dir: .agents
  wb_dir: .agents/wb
  templates_dir: .agents/a-docs/templates

time:
  default_offset: "+00:00"
  wb_offset: "-03:00"  # Workbench timezone

lint:
  excluded_path_prefixes:
    - a-docs/
    - arc/structure/

doctor:
  required_folders: [...]
  required_templates: [...]

sync:
  source_file: AGENTS.md
  target_files:
    - QWEN.md
    - CLAUDE.md
    - GEMINI.md
```

### tools.json

```json
{
  "version": "1.0.0",
  "tools": [...],
  "tool_categories": {...},
  "execution_modes": {...},
  "makefile_aliases": {
    "st": "structure",
    "ix": "index",
    "sy": "sync",
    "vf": "verify",
    "dr": "doctor"
  }
}
```

---

## 10. Makefile Quick Reference

### Common Commands

```bash
make help              # Show all commands
make setup             # Setup virtualenv
make doctor            # Validate structure
make new THEME=x       # Create workstream
make structure         # Generate structure docs
make index             # Update SPECS/ADRS indexes
make sync              # Sync agent docs
make verify            # Verify tasks complete
make lint              # Lint markdown docs
make all               # Full validation

# Aliases
make st                # structure
make ix                # index
make sy                # sync
make vf                # verify
make dr                # doctor
```

### WB Update Commands

```bash
make wb-touch                    # Update updated_at
make wb-normalize-time           # Normalize timestamps
make wb-files-changed            # Update Files Changed
make wb-task TASK_ID=T-01 ACTION=done
make wb-status STATUS=active
make wb-timeline MSG="message"
make wb-link FILE=plan KEY=related VALUE=xxx
```

---

## 11. Health Metrics

### System Health

| Metric | Command | Healthy |
|--------|---------|---------|
| Structure valid | `make doctor` | All ✓ |
| Docs linted | `make lint` | No issues |
| Tasks complete | `make verify` | All [x] |
| Tools working | `.agents/agents tools list` | 10+ tools |
| Config valid | `python -m json.tool .agents/tools.json` | Valid JSON |

### Session Health

| Metric | Check | Healthy |
|--------|-------|---------|
| Frontmatter | Has YAML frontmatter | All fields present |
| Tasks | Task markers | Consistent format |
| Timeline | Log file entries | Chronological |
| Links | Cross-references | Valid paths |
| Status | Frontmatter status | Valid value |

---

## 12. Troubleshooting

### Tool Not Found

```bash
# Check tools.json is valid
python -m json.tool .agents/tools.json

# List available tools
./.agents/agents tools list

# Check wrapper
./.agents/agents help
```

### Validation Fails

```bash
# Get detailed error
./.agents/agents doctor

# Fix lint issues
./.agents/agents lint-docs .agents/wb --fix

# Normalize timestamps
./.agents/agents wb-update normalize-time --all-wb
```

### Session Issues

```bash
# Check active session
cat .agents/wb/.active_session

# List sessions
ls -la .agents/wb/

# Verify session structure
./.agents/agents verify-tasks .agents/wb/<session>/
```

---

## 13. Best Practices

### DO

- ✅ Run `make doctor` before starting work
- ✅ Use `./.agents/agents tools info <tool>` to learn about tools
- ✅ Create workstreams with `make new THEME=x`
- ✅ Update workbench with `wb-update` commands
- ✅ Run `make verify` before marking complete
- ✅ Keep frontmatter synchronized
- ✅ Use ISO 8601 timestamps with timezone
- ✅ Follow task marker conventions

### DON'T

- ❌ Create folders manually (use `agents-new`)
- ❌ Edit frontmatter without checking format
- ❌ Use invalid status values
- ❌ Skip validation before commits
- ❌ Create tasks without IDs (T-NN)
- ❌ Use `doc` as Makefile alias (use `dr` for doctor)
- ❌ Modify tools.json without validating JSON

---

## 14. References

| Document | Purpose |
|----------|---------|
| `.agents/a-docs/agentic/README.md` | Agentic docs index |
| `.agents/a-docs/agentic/tools-json.md` | tools.json documentation |
| `.agents/a-docs/agentic/agents-tools.md` | Tool discovery |
| `.agents/a-docs/agentic/agents-wrapper.md` | CLI wrapper |
| `.agents/a-docs/agentic/makefile.md` | Makefile targets |
| `.agents/a-docs/agentic/agents-config.md` | Config loader |
| `.agents/a-docs/standards/` | Human-readable standards |
| `.agents/a-docs/templates/` | Document templates |

---

## 15. Enforcement

This rule is enforced by:

1. **Automated validation** - `make doctor`, `make lint`, `make verify`
2. **Agent self-check** - Agents should validate before commits
3. **CI/CD pipelines** - Pre-merge validation gates
4. **Peer review** - Human review of agent work

### Violation Handling

```
1. Warning: Minor issues (formatting, missing frontmatter)
2. Fix required: Validation failures (doctor, lint, verify)
3. Revert: Critical issues (broken structure, invalid JSON)
```

---

*Last updated: 2026-02-23*  
*Version: 1.0*  
*Applies to: All agents operating in .agents system*
