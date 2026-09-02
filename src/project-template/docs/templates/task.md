---
doc_type: task
id: YYMMDD_HHMM_<theme>_task_01
theme: <theme>
status: active
owners:
- worker
- tester
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-04-04T10:08:12-03:00'
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
child_spec: <child_spec_id_or_empty>
depends_on:
- <plan_doc_id>
links:
  plan: <plan_doc_id>
  roadmap: <roadmap_path>
---

# Tasks: <theme>

Each task must be executable by an agent now. Do not create task items whose
only purpose is to make the plan, research the plan, or gather broad context.
New tasks must not be created as `done`; seed them as `pending` unless the
work is actively being executed. Backfilled `done` rows require task-scoped
ledger evidence and an explicit evidence id.

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | pending | worker | <note> |

**State values:** `pending` | `in_progress` | `problem` | `moved` | `implemented_untested` | `tested_needs_spec_validation` | `done`

- `pending` - not started
- `in_progress` - actively being executed
- `problem` - a real blocker exists
- `moved` - deferred to a later plan/session; Notes must include destination + reason
- `implemented_untested` - code or docs are in place, validation has not run yet
- `tested_needs_spec_validation` - validation passed, but spec/UX/acceptance validation is still pending
- `done` - finished; requires task-scoped `.evidence.jsonl` closure evidence,
  valid `evidence_id`, and no unresolved blocking failed evidence. Use explicit
  `N/A` only when validation truly does not apply.

For a closed task missing observed evidence, append a real check with
`afol evidence reverify -S <session> -T <task> -x "<command>"`; do not edit
the ledger or State Board manually.

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State source:** lifecycle state belongs only in this `State Board` and AFOL
commands. Do not add parallel `T-xx` checklist rows or checkbox-done wording as
a state transition.

**Status output convention:** keep `BLOCKERS` focused on explicit lifecycle
blockers from task state. Auxiliary freshness/index/health findings are surfaced as
`WARNINGS` and should not be treated as lifecycle blockers.

`afol status` exposes:

- `SAFE_NEXT_ACTION`: the next practical move for the active task/scope
- `PROBLEM_REASON`: a concrete blocker reason when available, preferring
  inline `State Board` notes for problem-state tasks as `reason=<urlencoded>`,
  omitted when no concrete blocker exists.

## Governance Context

- Roadmap feature: `<feature_id>`
- Parent spec: `<parent_spec_id>`
- Child spec: `<child_spec_id_or_empty>`
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules

- [ ] Check lesson entries in [../lessons/entries/README.md](../lessons/entries/README.md)

### Useful Resources

- Rules useful for this task:
  - [ ] <rule-1>
- Docs useful for this task:
  - [ ] <doc-1>
- Skills useful for this task:
  - [ ] <skill-1>
- Integrations useful for this task:
  - [ ] <integration-1>

## Implementation Checkpoint

- Fill `Files planned` before edits so ownership is explicit.
- Update `Files touched` after edits with the actual changed paths.
- Files planned:
  - <path or glob>
- Files touched:
  - <path>
- Key decisions:
  - <decision>
- Deferred work:
  - Destination: <session/plan or N/A>
  - Reason: <why the task was moved or N/A>
- Validation notes:
  - <evidence or N/A>

## Test Gate

- Move to `implemented_untested` only after the implementation checkpoint.
- Move to `tested_needs_spec_validation` only when runtime validation passed but spec/UX validation is still pending.
- Complete with observed exit-zero evidence through `afol done --test-shell`
  or `afol d -x`; declared evidence alone does not authorize `done`.

### Test Evidence

- Command: `<command>`
- Result: <pass/fail>
- Evidence: <paste output snippet or link or N/A>

---

*Template: `docs/templates/task.md`*
