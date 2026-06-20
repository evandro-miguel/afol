---
id: 20260227_0900_task-board-simplification
theme: task-board-simplification
doc_type: lesson_entry
status: final
owner: agent
created_at: '2026-02-27T09:00:00-03:00'
updated_at: '2026-06-20T00:00:00-03:00'
links:
  related:
  - ../../wb/260224_1253_execution-integrity-hardening/260224_1253_execution-integrity-hardening_task_01.md
---

# Lesson: Task Board Simplification (State Board Only)

## Problem

Os arquivos de task tinham duplicação desnecessária:

1. **Task List** - lista simples com checkboxes (`- [x] T-01 description`)
2. **State Board** - tabela detalhada (`| T-01 | done | worker | notes |`)

Ambas as seções continham as mesmas tarefas, gerando:

- Redundância de informação
- Maior esforço de manutenção (atualizar dois lugares)
- Risco de inconsistência entre as seções

## Solution

Migramos para **apenas o State Board** (tabela), que é mais rico em informação:

### Formato Antigo (Duplicado)

- **Task List**
  - [x] T-01 Descrição da task
  - [x] T-02 Outra task
- **State Board**
  - Task: `T-01`, Checklist: `- [x]`, State: `done`, Owner: `worker`, Notes: `Nota`
  - Task: `T-02`, Checklist: `- [x]`, State: `done`, Owner: `worker`, Notes: `Nota`

### Formato Novo (Simplificado)

- **State Board**
  - Task: `T-01`, State: `done`, Owner: `worker`, Notes: `Nota`
  - Task: `T-02`, State: `done`, Owner: `worker`, Notes: `Nota`

## Changes Made

1. **Template updated:** `docs/templates/task.md`
   - Removida seção `## Task List`
   - Mantida apenas `## State Board` com 4 colunas (Task, State, Owner, Notes)

2. **Migration path:** current AFOL task files must use the simplified
   `State Board` format. Historical Python migration scripts are retired.

3. **Implementation updates:**
   - Current validation reads task state from the `State Board`.
   - `afol verify-tasks --strict` is the public lifecycle consistency check.

## Prevention Rules

- ✅ **Nunca duplicar lista de tasks** - Usar apenas State Board
- ✅ **State Board é a fonte da verdade** - Tasks são extraídas da tabela
- ✅ **Manter template simplificado** - Sem Task List duplicada

## Benefits

- **Seções de task**
  - Antes: 2 (Task List + State Board)
  - Depois: 1 (State Board only)
- **Colunas na tabela**
  - Antes: 5 (Task, Checklist, State, Owner, Notes)
  - Depois: 4 (Task, State, Owner, Notes)
- **Linhas por arquivo**
  - Antes: ~70-100
  - Depois: ~60-80
- **Esforço de manutenção**
  - Antes: atualizar 2 lugares
  - Depois: atualizar 1 lugar

## Implementation Notes

- Retired Python scripts handled the original migration.
- Current public behavior belongs to the TypeScript AFOL implementation under
  `cli/**`.
- Downstream task templates must keep the 4-column State Board format.

## Tests Updated

- `test_agents_lint_state_board.py`: formato 4 colunas (Task / State / Owner / Notes)
- `test_agents_lint_noise_reduction.py`: State Board sem coluna Checklist
- `test_agents_wb_update_task_marker.py`: testes com formato simplificado
- `test_verify_tasks_strict.py`: tasks em State Board (não checkboxes)

**All tests passing:** 68 tests, 0 failures

## Verification

```bash
# Verify tasks
afol verify-tasks --strict

# Validate project
afol validate project
```

## References

- Template: `docs/templates/task.md`
- Task verifier: `afol verify-tasks --strict`
- Project validator: `afol validate project`

---

*Lesson created: 2026-02-27 | Migration: 14 files | Lines saved: ~10-20 per file | Tests: 68 passed*
