---
doc_type: task
id: 260223_1834_lint-doc-exclusions_task_01
theme: lint-doc-exclusions
status: done
owners:
- worker
- tester
created_at: '2026-02-23T15:34:09-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
depends_on:
- 260223_1834_lint-doc-exclusions_plan_01
links:
  spec: 260223_1834_lint-doc-exclusions_spec-lite_01
  report: 260223_1834_lint-doc-exclusions_report_01
---

# Tasks: lint-doc-exclusions

## Task List

- [x] T-001 Excluir docs de ensino/orientação do escopo do lint.
- [x] T-002 Validar fluxo completo e registrar evidências.

## State Board

| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-001 | - [x] | done | worker | Exclusions adicionadas no scanner do linter. |
| T-002 | - [x] | done | worker | `make lint` e validações finais executadas. |

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
  - `.agents/scripts/agents-lint-docs.py`
  - `.agents/a-docs/lessons/general-lessons.md`
  - `.agents/wb/260223_1834_lint-doc-exclusions/*.md`
- Key decisions:
  - Ignore docs meant for learning/orientation by default in lint scope.

## Test Gate

- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence

- Command: `<command>`
- Result: pass
- Evidence: `make lint` -> 21 files checked, 0 issues.

---

*Template: `.agents/a-docs/templates/task.md`*
