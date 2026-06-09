---
doc_type: task
id: 260531_1038_py-retirement-bootstrap-cleanup_task_01
theme: py-retirement-bootstrap-cleanup
status: active
owners:
- worker
- tester
workstream_intent: delivery
artifact_purpose: Track executable work items with owners, state, and evidence expectations.
created_at: 2026-05-31 10:38:08-03:00
updated_at: '2026-05-31T10:45:09-03:00'
roadmap_feature: F-00
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
child_spec: null
depends_on:
- 260531_1038_py-retirement-bootstrap-cleanup_plan_01
links:
  plan: 260531_1038_py-retirement-bootstrap-cleanup_plan_01
  report: 260531_1038_py-retirement-bootstrap-cleanup_report_01
  roadmap: docs/arc/GENERAL-ROADMAP.md
output_artifacts:
  primary:
    task: 260531_1038_py-retirement-bootstrap-cleanup_task_01
    plan: 260531_1038_py-retirement-bootstrap-cleanup_plan_01
    report: 260531_1038_py-retirement-bootstrap-cleanup_report_01
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

# Tasks: py-retirement-bootstrap-cleanup

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | agent-a-bootstrap | Implement deterministic legacy Python scaffold cleanup detection/planning/apply behavior for bootstrap/update targets, with focused tests. (evidence: E-20260531104406286540) |
| T-02 | done | agent-b-cli | Remove public routing dependence on legacy `./.agents/agents` for governed creation/help paths touched by this workstream, with focused tests. (evidence: E-20260531104412535004) |
| T-03 | done | agent-c-docs-gates | Update docs/gates to match Python retirement behavior and add/adjust checks proving template/downstream cleanup stays Python-free. (evidence: E-20260531104417906171) |
| T-04 | done | orchestrator | Integrate delegated work, run validation, record evidence, and close the session only after strict verification passes. (evidence: E-20260531104422799198) |

**State values:** `pending` | `in_progress` | `problem` | `moved` | `implemented_untested` | `tested_needs_spec_validation` | `done`

- `pending` - not started
- `in_progress` - actively being executed
- `problem` - a real blocker exists
- `moved` - deferred to a later plan/session; Notes must include destination + reason
- `implemented_untested` - code or docs are in place, validation has not run yet
- `tested_needs_spec_validation` - validation passed, but spec/UX validation is still pending
- `done` - finished; requires task-scoped `.evidence.jsonl` closure evidence,
  valid `evidence_id`, and no unresolved blocking failed evidence.

## Governance Context

- Roadmap feature: `F-00`
- Parent spec: `260521_0000_total-reformulation-strategy_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

### Prevention Rules

- [x] Prior total-reformulation memory checked.
- [x] Current template boundary evidence checked.
- [x] Bootstrap implementation and template wrapper behavior checked.

### Useful Resources

- Rules useful for this task:
  - [x] `AGENTS.md`
- Docs useful for this task:
  - [x] `docs/map/README.md`
  - [x] `docs/arc/SPECS/260531_0000_template-cli-boundary-hardening_spec_01.md`
- Skills useful for this task:
  - [x] `agentic-orchestrator`
  - [x] `agentic-folder-sys`
  - [x] `code-discovery`
- Integrations useful for this task:
  - [x] GitNexus CLI status/analyze before final closeout

## Implementation Checkpoint

- Files touched:
  - Pending delegated execution.
- Key decisions:
  - Split write ownership across bootstrap, CLI routing, and docs/gates.
- Deferred work:
  - Destination: N/A
  - Reason: N/A
- Validation notes:
  - Pending delegated execution.

## Test Gate

- Move to `implemented_untested` only after implementation checkpoint.
- Move to `tested_needs_spec_validation` only when runtime validation passed but spec/UX validation is still pending.
- Record the real command or gate, result, artifact path or note, and returned evidence id before marking `done`.

### Test Evidence

- Command: pending
- Result: pending
- Evidence: pending
