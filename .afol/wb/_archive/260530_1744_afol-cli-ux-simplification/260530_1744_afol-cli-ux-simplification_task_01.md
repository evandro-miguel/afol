---
doc_type: task
id: 260530_1744_afol-cli-ux-simplification_task_01
theme: afol-cli-front-door
status: active
owners:
- worker
- tester
workstream_intent: delivery
artifact_purpose: Track executable work items with owners, state, and evidence expectations.
created_at: 2026-05-30 18:00:01-03:00
updated_at: '2026-05-30T18:09:57-03:00'
roadmap_feature: F-03
parent_spec: 260521_0030_agent-command-design-system_spec_01
child_spec: null
depends_on:
- 260530_1744_afol-cli-ux-simplification_plan_01
links:
  plan: 260530_1744_afol-cli-ux-simplification_plan_01
  roadmap: docs/arc/GENERAL-ROADMAP.md
output_artifacts:
  primary:
    task: 260530_1744_afol-cli-ux-simplification_task_01
    plan: 260530_1744_afol-cli-ux-simplification_plan_01
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

# Tasks: afol-cli-front-door

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
| T-01 | done | worker | Implement afol as the canonical simple CLI command and keep ./a as compatibility alias (evidence: E-20260530180957430710) |

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

- Roadmap feature: `F-03`
- Parent spec: `260521_0030_agent-command-design-system_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules

- [ ] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [ ] Check lesson entries in [../lessons/entries/](../lessons/entries/)

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

- Files touched:
  - `afol`
  - `a`
  - `src/project-template/afol`
  - `src/project-template/a`
  - `cli/main.ts`
  - `cli/tests/kernel.test.ts`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/test_front_door_a.py`
  - `.agents/scripts/tests/test_agents_bootstrap.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `README.md`
  - `docs/agentic/agents-bootstrap.md`
  - `docs/arc/GENERAL-ROADMAP.md`
  - `docs/arc/260521_total-reformulation-execution-plan.md`
  - `docs/arc/SPECS/260521_0010_universal-agent-cli_spec_01.md`
  - `docs/arc/SPECS/260521_0030_agent-command-design-system_spec_01.md`
  - `docs/arc/SPECS/F-01/spec-tests/260521_0130_universal-agent-cli-kernel-contract_spec-test_01.md`
  - `docs/arc/SPECS/F-03/spec-tests/260521_0135_agent-command-design-system_spec-test_01.md`
  - `docs/standards/bootstrap-other-repo.md`
  - `src/project-template/docs/standards/bootstrap-other-repo.md`
  - `package.json`
- Key decisions:
  - `afol` is canonical; `./a` delegates to `afol` for compatibility.
  - `afol check` uses the existing validation command family when Bun is
    available and falls back to `.agents/agents doctor` in wrapper-only mode.
  - `afol start`, `afol done --test`, and `afol close` normalize to existing
    governed implementation/session commands instead of introducing a second
    state machine.
- Deferred work:
  - Destination: future public distribution slice
  - Reason: publishing/installing a global package or user-level PATH shim is
    outside this implementation request.
- Validation notes:
  - Focused and broad gates passed; full runtime compatibility file has two
    unrelated environment errors when PyYAML is unavailable.

## Test Gate

- Move to `implemented_untested` only after the implementation checkpoint.
- Move to `tested_needs_spec_validation` only when runtime validation passed but spec/UX validation is still pending.
- Record the real command or gate, result, artifact path or note, and returned evidence id before marking `done`.
- If validation does not apply, record `N/A` explicitly in the evidence ledger before marking `done`.

### Test Evidence

- Command: `bun test cli/tests/kernel.test.ts`
- Result: pass
- Evidence: `9 pass, 0 fail`
- Command: `bun run typecheck`
- Result: pass
- Evidence: `tsc --noEmit -p tsconfig.json`
- Command: `PYTHONPATH=.agents/scripts python3 .agents/scripts/tests/test_front_door_a.py`
- Result: pass
- Evidence: `Ran 11 tests ... OK`
- Command: `PYTHONPATH=.agents/scripts python3 -m unittest discover -s .agents/scripts/tests -p 'test_agents_bootstrap.py'`
- Result: pass
- Evidence: `Ran 31 tests ... OK`
- Command: `PYTHONPATH=.agents/scripts python3 .agents/scripts/tests/test_runtime_compatibility.py RuntimeCompatibilityTests.test_bootstrap_mandatory_files_use_minimal_root_runtime_docs RuntimeCompatibilityTests.test_public_onboarding_docs_include_full_and_partial_paths`
- Result: pass
- Evidence: `Ran 2 tests ... OK`
- Command: `bun test`
- Result: pass
- Evidence: `27 pass, 0 fail`
- Command: `just lint`
- Result: pass
- Evidence: `Files checked: 183; Issues found: 0`
- Command: `just lint-scripts`
- Result: pass
- Evidence: `All checks passed`
- Command: `git diff --check`
- Result: pass
- Evidence: no output

---

*Template: `docs/templates/task.md`*
