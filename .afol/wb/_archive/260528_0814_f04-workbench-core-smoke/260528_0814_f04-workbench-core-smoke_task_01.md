---
doc_type: task
id: 260528_0814_f04-workbench-core-smoke_task_01
theme: f04-workbench-core-smoke
status: active
owners:
- worker
- tester
workstream_intent: delivery
artifact_purpose: Track executable work items with owners, state, and evidence expectations.
created_at: 2026-05-28 08:14:45-03:00
updated_at: '2026-05-30T17:20:07-03:00'
roadmap_feature: F-04
parent_spec: 260521_0040_governance-workbench-system_spec_01
child_spec: null
depends_on:
- 260528_0814_f04-workbench-core-smoke_plan_01
links:
  plan: 260528_0814_f04-workbench-core-smoke_plan_01
  roadmap: docs/arc/GENERAL-ROADMAP.md
output_artifacts:
  primary:
    task: 260528_0814_f04-workbench-core-smoke_task_01
    plan: 260528_0814_f04-workbench-core-smoke_plan_01
  sidecars:
    brainstorm: null
    research: null
    explorer_check: null
    postmortem: null
  sidecar_justification:
    brainstorm: not_required
    research: not_required
    explorer_check: not_required
    postmortem: not_required
---

# Tasks: f04-workbench-core-smoke

## Output Artifacts (file-first)

- Primary artifact: `task`
- Sidecars:
  - brainstorm: ``
  - research: ``
  - explorer_check: ``
  - postmortem: ``
- Sidecar justification:
  - Provide one value per optional artifact, or `not_required`.

Each task must be executable by an agent now. Do not create task items whose
only purpose is to make the plan, research the plan, or gather broad context.
New tasks must not be created as `done`; seed them as `pending` unless the
work is actively being executed. Backfilled `done` rows require task-scoped
ledger evidence and an explicit evidence id.

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Smoke F-04 workbench core flow (evidence: E-20260528081453830842) |

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

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context

- Roadmap feature: `F-04`
- Parent spec: `260521_0040_governance-workbench-system_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules

- [x] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [x] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources

- Rules useful for this task:
  - [x] Governed workbench execution rules
- Docs useful for this task:
  - [x] `docs/arc/SPECS/260521_0040_governance-workbench-system_spec_01.md`
- Skills useful for this task:
  - [x] `agentic-folder-sys`
- Integrations useful for this task:
  - [x] Workbench CLI

## Implementation Checkpoint

- Files touched:
  - `.agents/wb/260528_0814_f04-workbench-core-smoke/260528_0814_f04-workbench-core-smoke_task_01.md`
  - `.agents/wb/260528_0814_f04-workbench-core-smoke/.evidence.jsonl`
- Key decisions:
  - Keep this smoke to the minimum workbench lifecycle path.
- Deferred work:
  - Destination: N/A
  - Reason: N/A
- Validation notes:
  - Evidence `E-20260528081453830842` records the smoke completion.

## Test Gate

- Move to `implemented_untested` only after the implementation checkpoint.
- Move to `tested_needs_spec_validation` only when runtime validation passed but spec/UX validation is still pending.
- Record the real command or gate, result, artifact path or note, and returned evidence id before marking `done`.
- If validation does not apply, record `N/A` explicitly in the evidence ledger before marking `done`.

### Test Evidence

- Command: `smoke: implement complete`
- Result: passed
- Evidence: `E-20260528081453830842`

---

*Template: `docs/templates/task.md`*
