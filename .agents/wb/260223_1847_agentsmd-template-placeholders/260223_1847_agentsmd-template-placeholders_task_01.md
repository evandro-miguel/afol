---
doc_type: task
id: 260223_1847_agentsmd-template-placeholders_task_01
theme: agentsmd-template-placeholders
status: done
owners:
- worker
- tester
created_at: '2026-02-23T15:47:41-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
depends_on:
- 260223_1847_agentsmd-template-placeholders_plan_01
links:
  spec: 260223_1847_agentsmd-template-placeholders_spec-lite_01
  report: 260223_1847_agentsmd-template-placeholders_report_01
---

# Tasks: agentsmd-template-placeholders

## Task List
- [x] T-001 Reescrever AGENTS.md como template puro com placeholders.
- [x] T-002 Sincronizar e validar (`make sync`, `make lint`, `make verify`).

## State Board
| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-001 | - [x] | done | worker | Template puro aplicado sem preenchimento de tools/MCP/skills. |
| T-002 | - [x] | done | worker | Sync e checks executados com sucesso. |

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
  - [x] `AGENTS.md` generic-first template rule
- Docs useful for this task:
  - [x] `.agents/a-docs/standards/workflow.md`
- Skills useful for this task:
  - [>] None
- Integrações useful for this task:
  - [>] None

## Implementation Checkpoint
- Files touched:
  - `AGENTS.md`
  - `QWEN.md`
  - `CLAUDE.md`
  - `GEMINI.md`
  - `.agents/a-docs/lessons/general-lessons.md`
- Key decisions:
  - Keep root contract as template, not prefilled repository playbook.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `<command>`
- Result: pass
- Evidence: `make sync` and `make lint` passed; `make verify` passed after task completion.

---
*Template: `.agents/a-docs/templates/task.md`*
