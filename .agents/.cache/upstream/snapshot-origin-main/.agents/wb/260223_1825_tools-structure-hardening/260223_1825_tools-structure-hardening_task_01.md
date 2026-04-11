---
doc_type: task
id: 260223_1825_tools-structure-hardening_task_01
theme: tools-structure-hardening
status: done
owners:
- worker
- tester
created_at: '2026-02-23T15:25:57-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
depends_on:
- 260223_1825_tools-structure-hardening_plan_01
links:
  spec: 260223_1825_tools-structure-hardening_spec-lite_01
  report: 260223_1825_tools-structure-hardening_report_01
---

# Tasks: tools-structure-hardening

## Task List

- [x] T-001 Reproduzir falhas de `make lint` e `make structure` e documentar causa raiz.
- [x] T-002 Corrigir scripts e revalidar comandos de ponta a ponta.

## State Board

| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-001 | - [x] | done | worker | Causa raiz identificada em parser de frontmatter e filtro de diretórios ocultos. |
| T-002 | - [x] | done | worker | Correções aplicadas e verificadas com comandos reais. |

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
  - [x] `.agents/a-docs/standards/structure-map.md`
- Docs useful for this task:
  - [x] `.agents/a-docs/standards/agents-usage.md`
- Skills useful for this task:
  - [>] None
- Integrações useful for this task:
  - [>] None

## Implementation Checkpoint

- Files touched:
  - `.agents/scripts/agents-lint-docs.py`
  - `.agents/scripts/agents-structure-map.py`
  - `.agents/scripts/agents-new.py`
  - `.agents/arc/structure/README.md`
  - `.agents/arc/structure/backend.md`
  - `.agents/arc/structure/tests.md`
- Key decisions:
  - Keep fixes narrow and compatible with current templates/docs.
  - Archive temporary validation workstream under `.agents/z-arq/`.

## Test Gate

- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence

- Command: `<command>`
- Result: pass
- Evidence: `make lint` (exit 0), `make structure` generated `backend.md/tests.md`, `make new THEME=id-fix-check SPEC=lite` created resolved IDs.

---

*Template: `.agents/a-docs/templates/task.md`*
