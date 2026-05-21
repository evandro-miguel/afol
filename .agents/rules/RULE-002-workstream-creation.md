---
id: RULE-002
theme: workstream-creation
version: 1.0
created: 2026-02-23
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
updated_at: '2026-04-19T18:08:11-03:00'
---

# Workstream Creation

**Purpose:** Standardize workstream creation under a mandatory roadmap-first
governance model with direct execution plans, optional exploration sidecars, and
closure gates.

---

## Creating Workstreams

### Artifact Economy Gate

Workbench artifacts are operational state, not thinking space. Create or update
them only when they will be used to coordinate governed execution, record
required evidence, or preserve a durable decision.

- Do not create a workbench session for a planning-only answer, a short
  question, a quick read-only check, or broad context gathering.
- Do not create `research`, `brainstorm`, `explorer-check`, `log`, `report`,
  `spec`, `spec-lite`, or `postmortem` files by habit. Add them only when the
  user requested that deliverable, the rule set requires it for the actual
  work, or it is the smallest blocking proof before safe execution.
- Do not create a task whose purpose is to create the plan, research the plan,
  or decide how to make the real tasks. Do needed discovery first, then put the
  execution work in the plan/task board.
- For governed implementation or delivery, create or target the session before
  product edits, move the task to `in_progress`, execute, verify, record
  evidence, and only then close the task.
- When a problem brief, roadmap entry, or spec section provides `Roadmap
  feature`, `Parent spec`, or `Child spec`, use those values directly for the
  governed session instead of searching for alternate governance context.

### File-First Output Contract

For `plan`, `task`, and `report` artifacts in this workstream:

- Required output fields: explicit primary artifact links and optional sidecar links
  (`brainstorm`, `research`, `explorer-check`, `postmortem`).
- Required justification: every optional sidecar must include a
  `sidecar_justification` value.
- `sidecar_justification` must state `not_required` when an optional sidecar is
  intentionally skipped.
- Final completion reports should follow the compact handoff format:
  `STATUS`, `TASK`, `FILES_WRITTEN`, `VALIDATION_OR_CHECKS`, `SUMMARY`,
  `BLOCKERS`, and `NEXT`.

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

# Via Justfile
just new THEME=<theme-name> FEATURE_ID=F-01 PARENT_SPEC=<parent-spec-id>
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
- [%] T-03 Description # implemented_untested
- [&] T-04 Description # tested_needs_spec_validation
- [!] T-05 Description # problem
- [>] T-06 Description # moved
- [x] T-07 Description # done
```

---

## Updating Tasks

```bash
# Preferred governed execution path
./.agents/agents implement start --session <session-id> --task-id T-01
./.agents/agents implement complete --session <session-id> --task-id T-01 \
  --command "just verify" --result passed --artifact .agents/wb/<session-id>/<report-or-log>

# Manual evidence path when implement complete is not the right wrapper
./.agents/agents wb-update evidence T-01 --session <session-id> \
  --command "just verify" --result passed --artifact .agents/wb/<session-id>/<report-or-log>
./.agents/agents wb-update task T-01 --session <session-id> --mark-done --evidence-id E-...

# Intermediate/problem states
./.agents/agents wb-update task T-02 --session <session-id> --mark-in-progress
./.agents/agents wb-update task T-03 --session <session-id> --mark-implemented
./.agents/agents wb-update task T-04 --session <session-id> --mark-tested
./.agents/agents wb-update task T-05 --session <session-id> --mark-problem

# Legacy aliases still parse, but new work should use the canonical states.
```

---

## Workflow Patterns

### Decision Intake Before Workstreams

Before creating or executing a governed workstream for ambiguous,
product-shaped, benchmark-heavy, or prioritization-heavy work:

- Treat decision intake as a ladder, not a mandatory pipeline. Use the smallest
  subset that resolves the uncertainty, and keep the fast lane conversational
  when the user wants speed.
- Frame the user, behavior evidence, observable outcome, constraints,
  non-goals, reversibility, and first-slice appetite.
- Run challenge before committing to the solution: critical assumption, rival
  hypothesis, pre-mortem failure mode, simpler alternative, and first scope cut.
- Benchmark only after the frame and first solution hypothesis exist.
- Prioritize qualitatively by default. Ask before formal scoring when the user
  wants speed; if scoring is useful, separate importance, sequence, and
  friction.
- Cut the first plan into fixed-appetite vertical slices.
- Use `docs/standards/decision-intake.md` as the canonical standard.

### Standard Workflow

```bash
# 1. Define or update roadmap feature in docs/arc/GENERAL-ROADMAP.md

# 2. Define or update parent spec in docs/arc/SPECS/

# 3. Run the smallest useful decision-intake lane when the request is
#    ambiguous, product-shaped, benchmark-heavy, or prioritization-heavy. Use
#    formal scoring only when it helps the decision or the user asks.

# 4. For feature work, update affected project-local skills and docs

# 5. Add a pending universal-skills propagation item when a local skill changed

# 6. Create workstream linked to approved strategic docs
just new THEME=feature-name FEATURE_ID=F-01 PARENT_SPEC=<parent-spec-id>

# 7. Create optional artifacts only when requested, required, or blocking. If
#    brainstorm/research/explorer-check exists, keep it as a sidecar and
#    finalize it before closure.

# 8. Reuse prior findings when relevant
./.agents/agents knowledge search <query>

# 9. Start the task before product edits
./.agents/agents implement start --session <session-id> --task-id T-01

# 10. Work on tasks, validate, and close with evidence
./.agents/agents implement complete --session <session-id> --task-id T-01 \
  --command "just verify" --result passed --artifact .agents/wb/<session-id>/<report-or-log>

# 11. Finalize optional artifacts that exist before closing report
./.agents/agents wb-update status --session <session-id> --file report --value final

# 12. Validate
just doctor
just lint
just verify
```

### Feature Skill and Documentation Propagation

For every feature addition or meaningful feature behavior change:

- Update the affected project-local skill under `.agents/skills/` when future
  agents must follow the new behavior.
- Update affected project docs, command references, standards, roadmap, and
  specs so operator-facing guidance matches the behavior.
- Add a visible pending item in the roadmap, spec, task, plan, or report to
  propose the relevant project-local skill change back to the external
  `universal-skills` checkout.
- Propagate skills only through the approved branch/PR flow, such as
  `./.agents/agents skills-sync push <skill> --branch <branch> --commit --push --pr`;
  never push directly to universal `main`.
- Do not mark the feature fully closed unless local skill/docs updates are
  complete and the universal-skills propagation pending item is recorded.

### Bug Fix Workflow

```bash
# 1. Confirm the bug belongs to an existing roadmap feature

# 2. Use parent spec or create a low-risk feature spec if needed

# 3. Create workstream with linked governance context
./.agents/agents new bugfix-description --feature-id F-01 --parent-spec <parent-spec-id> --spec-lite

# 4. Investigate and document in spec-lite.md

# 5. Implement fix

# 6. Validate
just verify
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
- ✅ Run the smallest useful decision-intake lane before benchmark, planning, or execution for ambiguous/product-shaped work
- ✅ Use qualitative prioritization by default and ask before formal scoring when the user wants speed
- ✅ Create or update the roadmap feature before new non-trivial work
- ✅ Link each workstream to `--feature-id` and `--parent-spec`
- ✅ Update affected project-local skills and docs for every feature addition
- ✅ Record a pending universal-skills propagation item for every relevant local skill change
- ✅ Use child specs when a feature benefits from clearer decomposition
- ✅ Keep plans focused on direct execution, not pre-plan research or broad discovery tasks
- ✅ Use brainstorm, research, or explorer-check only when requested or needed as a small blocking proof
- ✅ Avoid low-value workbench files; each artifact must have an operational reason
- ✅ Reuse `.agents/agents knowledge` before repeating research
- ✅ Finalize every optional artifact that exists before final session closure
- ✅ Use `--spec` or `--spec-lite` only as local refinement, not as a replacement for the parent feature spec
- ✅ Choose `--spec-lite` freely when a lighter workstream-level refinement is enough
- ✅ Mark tasks with correct status markers
- ✅ Add timeline entries for major steps

**DON'T:**

- ❌ Create folders manually (use `agents-new`)
- ❌ Start non-trivial implementation without roadmap + parent spec
- ❌ Benchmark a product-shaped idea before framing the user, outcome, non-goals, assumptions, and first slice
- ❌ Force formal scoring when the user wants a fast qualitative decision
- ❌ Add generic "research first", "investigate", or "create the real plan" phases to an execution plan
- ❌ Create workbench files to think out loud, save tokens, or satisfy habit rather than execution needs
- ❌ Create tasks already marked `done`/`[x]` or close tasks without a valid task-scoped evidence id
- ❌ Edit product files before the governed task is moved to `in_progress`
- ❌ Close feature work with stale local skills, stale docs, or no universal-skills propagation pending item
- ❌ Use spaces in theme names
- ❌ Skip task IDs (always use T-NN)
- ❌ Mix marker formats (use `- [x]` not `- [X]`)

---

## References

- `docs/agentic/agents-new.md` - agents-new.py docs
- `docs/agentic/agents-wb-update.md` - wb-update docs
- RULE-003 - Documentation Standards
- RULE-004 - Validation & Linting

---

*Version: 1.0 | Lines: ~140 | Max: 250*
