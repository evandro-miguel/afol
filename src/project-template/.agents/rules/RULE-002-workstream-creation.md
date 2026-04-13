---
id: RULE-002
theme: workstream-creation
version: 1.0
created: 2026-02-23
applies_to: All agents (QWEN, CLAUDE, GEMINI)
---

# Workstream Creation

**Purpose:** Standardize workstream creation under a mandatory roadmap-first governance model with explicit exploration and closure gates.

---

## Creating Workstreams

### Standard Workstream

```bash
# Basic (plan + task + log) linked to roadmap + parent spec
./.agents/agents new <theme-name> --feature-id F-01 --parent-spec <parent-spec-id>

# With local workstream spec refinement
./.agents/agents new <theme-name> --feature-id F-01 --parent-spec <parent-spec-id> --spec

# With local workstream spec-lite refinement
./.agents/agents new <theme-name> --feature-id F-01 --parent-spec <parent-spec-id> --spec-lite

# With child spec linkage for large features
./.agents/agents new <theme-name> --feature-id F-01 --parent-spec <parent-spec-id> --child-spec <child-spec-id>

# With a pack folder for another major track inside an existing session
./.agents/agents new <theme-name> --feature-id F-07 --parent-spec <parent-spec-id> --pack <pack-slug> --into-session <session-id> --spec

# Via Makefile
make new THEME=<theme-name> FEATURE_ID=F-01 PARENT_SPEC=<parent-spec-id>
```

### Quick Task (in active session)

```bash
./.agents/agents new "Quick task description" --quick
```

Quick mode is only valid when the work is already inside an approved feature context in the active session.

---

## Naming Conventions

| Element | Pattern | Example |
|---------|---------|---------|
| Session folder | `YYMMDD_HHMM_<theme>` | `260223_1800_auth-refactor` |
| Plan file | `*_plan_NN.md` | `260223_1800_auth-refactor_plan_01.md` |
| Task file | `*_task_NN.md` | `260223_1800_auth-refactor_task_01.md` |
| Log file | `*_log_NN.md` | `260223_1800_auth-refactor_log_01.md` |
| Spec file | `*_spec_NN.md` | `260223_1800_auth-refactor_spec_01.md` |
| Roadmap feature | `F-NN` | `F-01` |
| Task IDs | `T-NN` (2-3 digits) | `T-01`, `T-02`, `T-10` |
| Pack folder | `packs/<pack-slug>/` | `packs/api-cleanup/` |

---

## Task Status Markers

```markdown
- [ ] T-01 Description # pending
- [/] T-02 Description # in_progress
- [%] T-03 Description # ready_for_test
- [!] T-04 Description # blocked
- [>] T-05 Description # skipped
- [x] T-06 Description # completed
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
# 1. Define or update roadmap feature in docs/arc/GENERAL-ROADMAP.md

# 2. Define or update parent spec in docs/arc/SPECS/

# 3. Create workstream linked to approved strategic docs
make new THEME=feature-name FEATURE_ID=F-01 PARENT_SPEC=<parent-spec-id>

# 4. Complete brainstorm + explorer-check before treating the plan as complete

# 5. Reuse prior findings when relevant
./.agents/agents knowledge search <query>

# 6. Work on tasks (edit files, implement)

# 7. Update workbench
./.agents/agents wb-update touch --session <session-id>
./.agents/agents wb-update task T-01 --session <session-id> --mark-done

# 8. Finalize postmortem before closing report
./.agents/agents wb-update status --session <session-id> --file postmortem --value final
./.agents/agents wb-update status --session <session-id> --file report --value final

# 9. Validate
make doctor
make lint
make verify
```

### Bug Fix Workflow

```bash
# 1. Confirm the bug belongs to an existing roadmap feature

# 2. Use parent spec or create a low-risk feature spec if needed

# 3. Create workstream with linked governance context
./.agents/agents new bugfix-description --feature-id F-01 --parent-spec <parent-spec-id> --spec-lite

# 4. Investigate and document in spec-lite.md

# 5. Implement fix

# 6. Validate
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
- ✅ Create or update the roadmap feature before new non-trivial work
- ✅ Link each workstream to `--feature-id` and `--parent-spec`
- ✅ Use child specs when a feature benefits from clearer decomposition
- ✅ Use brainstorm + explorer-check before calling a major plan complete
- ✅ Reuse `.agents/agents knowledge` before repeating research
- ✅ Finalize postmortem before final session closure
- ✅ Use `--spec` or `--spec-lite` only as local refinement, not as a replacement for the parent feature spec
- ✅ Choose `--spec-lite` freely when a lighter workstream-level refinement is enough
- ✅ Mark tasks with correct status markers
- ✅ Add timeline entries for major steps

**DON'T:**

- ❌ Create folders manually (use `agents-new`)
- ❌ Start non-trivial implementation without roadmap + parent spec
- ❌ Use spaces in theme names
- ❌ Skip task IDs (always use T-NN)
- ❌ Mix marker formats (use `- [x]` not `- [X]`)

---

## References

- `.agents/agents new <theme>` - Workstream creation command
- `.agents/agents wb-update ...` - Workbench update command
- RULE-003 - Documentation Standards
- RULE-004 - Validation & Linting

---

*Version: 1.0 | Lines: ~140 | Max: 250*
