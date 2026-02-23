---
id: RULE-002
theme: workstream-creation
version: 1.0
created: 2026-02-23
applies_to: All agents (QWEN, CLAUDE, GEMINI)
---

# Workstream Creation

**Purpose:** Standardize workstream creation and task management.

---

## Creating Workstreams

### Standard Workstream

```bash
# Basic (plan + task + log)
./.agents/agents new <theme-name>

# With full specification
./.agents/agents new <theme-name> --spec

# With lite specification
./.agents/agents new <theme-name> --spec-lite

# Via Makefile
make new THEME=<theme-name>
```

### Quick Task (in active session)

```bash
./.agents/agents new "Quick task description" --quick
```

---

## Naming Conventions

| Element | Pattern | Example |
|---------|---------|---------|
| Session folder | `YYMMDD_HHMM_<theme>` | `260223_1800_auth-refactor` |
| Plan file | `*_plan_NN.md` | `260223_1800_auth-refactor_plan_01.md` |
| Task file | `*_task_NN.md` | `260223_1800_auth-refactor_task_01.md` |
| Log file | `*_log_NN.md` | `260223_1800_auth-refactor_log_01.md` |
| Spec file | `*_spec_NN.md` | `260223_1800_auth-refactor_spec_01.md` |
| Task IDs | `T-NN` (2-3 digits) | `T-01`, `T-02`, `T-10` |

---

## Task Status Markers

```markdown
- [ ] T-01 Description      # pending
- [/] T-02 Description      # in_progress
- [%] T-03 Description      # ready_for_test
- [!] T-04 Description      # blocked
- [>] T-05 Description      # skipped
- [x] T-06 Description      # completed
```

---

## Updating Tasks

```bash
# Mark task complete
./.agents/agents wb-update task T-01 --mark-done

# Mark in progress
./.agents/agents wb-update task T-02 --mark-in-progress

# Mark pending
./.agents/agents wb-update task T-03 --mark-pending

# Mark blocked
./.agents/agents wb-update task T-04 --mark-blocked

# Via Makefile
make wb-task TASK_ID=T-01 ACTION=done
```

---

## Workflow Patterns

### Standard Workflow

```bash
# 1. Create workstream
make new THEME=feature-name

# 2. Work on tasks (edit files, implement)

# 3. Update workbench
./.agents/agents wb-update touch
./.agents/agents wb-update task T-01 --mark-done

# 4. Validate
make doctor
make lint
make verify
```

### Bug Fix Workflow

```bash
# 1. Create with lite spec
./.agents/agents new bugfix-description --spec-lite

# 2. Investigate and document in spec-lite.md

# 3. Implement fix

# 4. Validate
make verify
```

---

## Timeline Entries (Log Files)

```markdown
## Timeline

- [2026-02-23T10:00:00-03:00] Started implementation
- [2026-02-23T11:30:00-03:00] Completed core logic
- [2026-02-23T14:00:00-03:00] Added tests
```

**Add timeline entry:**
```bash
./.agents/agents wb-update timeline --message "Implementation started"
```

---

## Best Practices

**DO:**
- ✅ Use descriptive theme names (kebab-case)
- ✅ Include `--spec` for complex features
- ✅ Use `--spec-lite` for bug fixes
- ✅ Mark tasks with correct status markers
- ✅ Add timeline entries for major steps

**DON'T:**
- ❌ Create folders manually (use `agents-new`)
- ❌ Use spaces in theme names
- ❌ Skip task IDs (always use T-NN)
- ❌ Mix marker formats (use `- [x]` not `- [X]`)

---

## References

- `.agents/a-docs/agentic/agents-new.md` - agents-new.py docs
- `.agents/a-docs/agentic/agents-wb-update.md` - wb-update docs
- RULE-003 - Documentation Standards
- RULE-004 - Validation & Linting

---

*Version: 1.0 | Lines: ~140 | Max: 250*
