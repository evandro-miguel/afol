---
doc_type: task
id: 260530_1708_global-wb-strict-evidence-repair_task_01
theme: global-wb-strict-evidence-repair
status: final
owners:
- worker
- tester
workstream_intent: delivery
artifact_purpose: Track executable work items with owners, state, and evidence expectations.
created_at: 2026-05-30 17:08:10-03:00
updated_at: '2026-05-30T17:20:07-03:00'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
child_spec: null
depends_on:
- 260530_1708_global-wb-strict-evidence-repair_plan_01
links:
  plan: 260530_1708_global-wb-strict-evidence-repair_plan_01
  roadmap: docs/arc/GENERAL-ROADMAP.md
output_artifacts:
  primary:
    task: 260530_1708_global-wb-strict-evidence-repair_task_01
    plan: 260530_1708_global-wb-strict-evidence-repair_plan_01
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

# Tasks: global-wb-strict-evidence-repair

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
| T-01 | done | worker | Fix strict workbench-root evidence verification so .agents/wb validates session ledgers correctly without false evidence issues. (evidence: E-20260530171652432400) |

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

- Roadmap feature: `F-11`
- Parent spec: `260521_0110_validation-ci-and-benchmarks_spec_01`
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
  - [x] `AGENTS.md` governed execution and verification rules
- Docs useful for this task:
  - [x] `.agents/wb/260413_1551_python-runtime-hardening/260413_1551_python-runtime-hardening_report_01.md`
- Skills useful for this task:
  - [x] `agentic-orchestrator`
  - [x] `agentic-folder-sys`
- Integrations useful for this task:
  - [x] Workbench CLI: `./.agents/agents verify-tasks`
  - [x] Workbench CLI: `./.agents/agents wb-update evidence`

## Implementation Checkpoint

- Files touched:
  - `.agents/scripts/verify-tasks.py`
  - `.agents/scripts/tests/test_verify_tasks_strict.py`
  - `.agents/wb/260413_1551_python-runtime-hardening/260413_1551_python-runtime-hardening_brainstorm_01.md`
  - `.agents/wb/260413_1551_python-runtime-hardening/260413_1551_python-runtime-hardening_explorer-check_01.md`
  - `.agents/wb/260413_1551_python-runtime-hardening/260413_1551_python-runtime-hardening_research_01.md`
  - `.agents/wb/260413_1551_python-runtime-hardening/.evidence.jsonl`
- Key decisions:
  - Resolve evidence ledger scope per containing workbench session during
    root-level strict verification.
  - Reconcile historical `260413_1551_python-runtime-hardening` evidence from
    its existing final report instead of changing historical task outcomes.
- Deferred work:
  - Destination: N/A
  - Reason: N/A
- Validation notes:
  - Focused unittest passed: 43 tests OK.
  - Historical strict passed for
    `.agents/wb/260413_1551_python-runtime-hardening`.
  - Root strict passed its strict checks and only remained open because this
    current task was still `in_progress` before closure.

## Test Gate

- Move to `implemented_untested` only after the implementation checkpoint.
- Move to `tested_needs_spec_validation` only when runtime validation passed but spec/UX validation is still pending.
- Record the real command or gate, result, artifact path or note, and returned evidence id before marking `done`.
- If validation does not apply, record `N/A` explicitly in the evidence ledger before marking `done`.

### Test Evidence

- Command: `.agents/scripts/.venv/bin/python -m unittest discover -s .agents/scripts/tests -p 'test_verify_tasks_strict.py'`
- Result: passed
- Evidence: `Ran 43 tests in 0.419s; OK`

- Command: `./.agents/agents verify-tasks --strict .agents/wb/260413_1551_python-runtime-hardening`
- Result: passed
- Evidence: `Total tasks: 9; Completed: 9; all strict checks passed`

- Command: `./.agents/agents verify-tasks --strict .agents/wb`
- Result: pre-close passed strict checks
- Evidence: strict checks passed; only open task was this active session before
  closure.

---

*Template: `docs/templates/task.md`*
