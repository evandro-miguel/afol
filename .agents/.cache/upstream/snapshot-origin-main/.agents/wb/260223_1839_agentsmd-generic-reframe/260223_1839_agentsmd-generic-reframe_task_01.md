---
doc_type: task
id: 260223_1839_agentsmd-generic-reframe_task_01
theme: agentsmd-generic-reframe
status: done
owners:
- worker
- tester
created_at: '2026-02-23T15:39:42-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
depends_on:
- 260223_1839_agentsmd-generic-reframe_plan_01
links:
  spec: 260223_1839_agentsmd-generic-reframe_spec-lite_01
  report: 260223_1839_agentsmd-generic-reframe_report_01
---

# Tasks: agentsmd-generic-reframe

## Task List
- [x] T-001 Reestruturar AGENTS.md no formato generico solicitado pelo usuario.
- [x] T-002 Sincronizar docs de agentes e validar fluxo (`lint`, `verify`).

## State Board
| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-001 | - [x] | done | worker | AGENTS.md reescrito com secoes genericas + dados atuais do repo. |
| T-002 | - [x] | done | worker | Sync + validacao executados com sucesso. |

State values:
- pending
- in_progress
- ready_for_test
- testing
- done
- blocked

## State Marker Rules

See: [`.agents/a-docs/standards/checkbox-protocol.md`](.agents/a-docs/standards/checkbox-protocol.md)

## Lessons Aplicáveis

Before starting work, consult relevant resources:

### Prevention Rules
- [x] Check: [`.agents/a-docs/lessons/general-lessons.md`](.agents/a-docs/lessons/general-lessons.md)

### Useful Resources
- Rules useful for this task:
  - [x] `.agents/a-docs/standards/workflow.md`
- Docs useful for this task:
  - [x] `.agents/a-docs/standards/agents-usage.md`
- Skills useful for this task:
  - [>] None
- Integrações useful for this task:
  - [>] None

## Implementation Checkpoint
- Files touched:
  - `AGENTS.md`
  - `.agents/a-docs/lessons/general-lessons.md`
  - `.agents/wb/260223_1839_agentsmd-generic-reframe/*.md`
- Key decisions:
  - Keep root AGENTS generic-first and use current repo info as concrete fill.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `<command>`
- Result: pass
- Evidence: `make sync`, `make lint`, `make verify`, `make all` executados com sucesso.

---
*Template: `.agents/a-docs/templates/task.md`*
