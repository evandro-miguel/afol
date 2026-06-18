---
doc_type: task
id: 260618_1420_orchestrator-coordination-radar_task_01
theme: orchestrator-coordination-radar
status: active
owners:
- orchestrator
- worker
- tester
created_at: '2026-06-18T14:20:00-03:00'
updated_at: '2026-06-18T15:50:26-03:00'
roadmap_feature: F-07
parent_spec: 260618_1519_orchestrator-coordination-radar_spec-child_01
child_spec: 260618_1519_orchestrator-coordination-radar_spec-child_01
depends_on:
- 260618_1420_orchestrator-coordination-radar_plan_01
links:
  plan: 260618_1420_orchestrator-coordination-radar_plan_01
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
---

# Tasks: orchestrator-coordination-radar

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | data-model-agent | Implement coordination radar data model, parsing, mutation correlation, and warning generation |
| T-02 | done | cli-agent | Add `afol session radar` compact and JSON output using the T-01 service |
| T-03 | done | context-template-agent | Integrate coordination warnings into context bundles and task templates |
| T-04 | done | validation-agent | Run targeted tests, release gates, AFOL rebuild, and evidence capture |

**State values:** `pending` | `in_progress` | `problem` | `moved` |
`implemented_untested` | `tested_needs_spec_validation` | `done`

## Governance Context

- Roadmap feature: `F-07`
- Governing spec:
  `.afol/adm/specs/260618_1519_orchestrator-coordination-radar_spec-child_01.md`
- Plan:
  `.afol/wb/260618_1420_orchestrator-coordination-radar/260618_1420_orchestrator-coordination-radar_plan_01.md`

## Coordination Claims

### T-01 Data Model

- Files planned:
  - `cli/services/local-state/workbench-index.ts`
  - `cli/services/local-state/*coordination*.ts`
  - `cli/services/orchestration/*coordination*.ts`
  - `cli/services/mutations/journal.ts`
  - `cli/tests/local-state-indexes.test.ts`
- Files touched:
  - `cli/services/local-state/workbench-index.ts`
  - `cli/services/local-state/coordination-radar.ts`
  - `cli/tests/local-state-indexes.test.ts`
- Expected handoff:
  - exported service/types for open task radar state and warnings
  - focused tests for parsing and overlap warning generation

### T-02 CLI

- Files planned:
  - `cli/commands/session.ts`
  - `cli/registry.ts`
  - `cli/tests/session-command.test.ts`
- Files touched:
  - `cli/commands/session.ts`
  - `cli/tests/session-command.test.ts`
- Expected handoff:
  - `afol session radar`
  - `afol session radar --json`
  - compact output that does not dump full workbench files

### T-03 Context And Templates

- Files planned:
  - `cli/services/context/types.ts`
  - `cli/services/context/bundler.ts`
  - `cli/tests/context-system.test.ts`
  - `docs/templates/task.md`
  - `src/project-template/docs/templates/task.md`
  - `cli/generated/template.ts`
- Files touched:
  - `docs/templates/task.md`
  - `src/project-template/docs/templates/task.md`
  - `.agents/hooks/index.json`
  - `src/project-template/.agents/hooks/index.json`
  - `cli/generated/template.ts`
- Expected handoff:
  - orchestrator context bundles include small coordination warnings
  - task templates include explicit `Files planned` before `Files touched`
  - generated template output is synchronized if required

### T-04 Validation

- Files planned:
  - `.afol/wb/260618_1420_orchestrator-coordination-radar/.evidence.jsonl`
  - `.afol/data/index/**`
- Files touched:
  - `.afol/wb/260618_1420_orchestrator-coordination-radar/.evidence.jsonl`
  - `.afol/data/index/**`
- Expected handoff:
  - targeted test results
  - project/release validation result
  - AFOL local-state rebuild result

## Implementation Checkpoint

- Files planned:
  - See `## Coordination Claims`.
- Files touched:
  - `cli/services/local-state/workbench-index.ts`
  - `cli/services/local-state/coordination-radar.ts`
  - `cli/commands/session.ts`
  - `cli/tests/local-state-indexes.test.ts`
  - `cli/tests/session-command.test.ts`
  - `docs/templates/task.md`
  - `src/project-template/docs/templates/task.md`
  - `.agents/hooks/index.json`
  - `src/project-template/.agents/hooks/index.json`
  - `cli/generated/template.ts`
  - `.afol/wb/260618_1420_orchestrator-coordination-radar/.evidence.jsonl`
- Key decisions:
  - Warnings are context only, not locks.
  - Planned files must be explicit task claims; no arbitrary prose guessing.
  - Touched files may come from task checkpoints and mutation journal records.
- Deferred work:
  - Destination: N/A
  - Reason: N/A
- Validation notes:
  - `bun test cli/tests/local-state-indexes.test.ts`: passed.
  - `bun test cli/tests/session-command.test.ts`: passed.
  - `bun test cli/tests/context-system.test.ts`: passed.
  - `bun run validate:template`: passed.
  - `./afol session radar --json`: passed.
  - `./afol ctx bundle -S 260618_1420_orchestrator-coordination-radar -T T-03 --role orchestrator --surface coordination --json`: passed.
  - `./afol local-state rebuild --json`: passed.
  - `./afol validate project --json`: passed.

## Test Gate

- Move a task to `implemented_untested` only after the task-specific
  implementation checkpoint is updated.
- Move a task to `tested_needs_spec_validation` only when runtime validation
  passed but spec acceptance still needs review.
- Mark `done` only after task-scoped evidence is recorded in `.evidence.jsonl`.

### Test Evidence

- Command: pending
- Result: passed
- Evidence:
  - `E-20260618145026267-2add5a`
  - `E-20260618145026329-557993`
  - `E-20260618145026390-7b63af`
  - `E-20260618145026450-361562`
