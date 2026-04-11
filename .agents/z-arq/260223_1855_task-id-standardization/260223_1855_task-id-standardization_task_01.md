---
doc_type: task
id: 260223_1855_task-id-standardization_task_01
theme: task-id-standardization
status: done
owners:
- worker
- tester
created_at: '2026-02-23T15:55:42-03:00'
updated_at: '2026-02-24T00:30:00-03:00'
depends_on:
- 260223_1855_task-id-standardization_plan_01
links:
  spec: 260223_1855_task-id-standardization_spec-lite_01
  report: 260223_1855_task-id-standardization_report_01
---

# Tasks: task-id-standardization


## State Board
| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Parser atualizado para formato `- [ ] T-01 ...`/`T-001`.
| T-02 | done | worker | Template + docs atualizados e validados.
| T-03 | done | worker | `agents-new.py` com `--quick` e bloqueio de novo stream sem `--force-new`.
| T-04 | done | worker | Novo `agents-wb-update.py` + `make wb-touch`/`make wb-files-changed`.
| T-05 | done | worker | Docs agentic já estavam em inglês - verificação concluída.
| T-06 | done | worker | Revisão final de consistência aprovada.
| T-07 | done | worker | 4 scripts + 2 docs + 5 comandos Makefile + frontmatter em 3 arquivos.


**State marker rules:** See [`.agents/a-docs/standards/checkbox-protocol.md`](.agents/a-docs/standards/checkbox-protocol.md)

## Lessons Aplicáveis

Before starting work, consult relevant resources:

### Prevention Rules
- [x] Check: [`.agents/a-docs/lessons/general-lessons.md`](.agents/a-docs/lessons/general-lessons.md)

### Useful Resources
- Rules useful for this task:
  - [x] Task IDs required in checklist lines
- Docs useful for this task:
  - [x] `.agents/a-docs/templates/task.md`
- Skills useful for this task:
  - [>] None
- Integrações useful for this task:
  - [>] None

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/verify-tasks.py`
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/agents-wb-update.py`
  - `.agents/scripts/README.md`
  - `.agents/a-docs/templates/task.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/a-docs/standards/Makefile`
  - `.agents/a-docs/standards/scripts-reference.md`
  - `AGENTS.md`
  - `.agents/a-docs/lessons/general-lessons.md`
- Key decisions:
  - Parse only checklist entries with explicit task IDs to avoid false positives from tables.
  - Enforce one active workstream and use quick mode for non-significant changes.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `<command>`
- Result: pass
- Evidence: `make verify`, `make lint`, `make all` passed with new parser behavior.

---
*Template: `.agents/a-docs/templates/task.md`*
