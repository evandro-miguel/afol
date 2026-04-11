---
id: 20260227_0900_task-board-simplification
theme: task-board-simplification
doc_type: lesson_entry
status: final
owner: agent
created_at: '2026-02-27T09:00:00-03:00'
updated_at: '2026-02-27T12:17:39-03:00'
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

2. **Migration script:** `.agents/scripts/migrate-task-board.py`
   - Remove seção `## Task List`
   - Remove coluna `Checklist` da tabela
   - Atualiza 14 arquivos de task existentes

3. **Script updates:**
   - `agents-lint-docs.py`: Atualizado `check_state_board()` para ler estado em `cells[1]` (antes era `cells[2]`)
   - `verify-tasks.py`: Adicionado suporte para extrair tasks do State Board (antes só lia checkboxes)

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

## Scripts Affected

- `agents-lint-docs.py`: `check_state_board()` atualizado para ler estado em `cells[1]`
- `verify-tasks.py`: `extract_tasks()` atualizado para ler State Board + legacy checkboxes
- `agents-wb-update.py`: `update_task_markers()` atualiza estado na tabela de 4 colunas
- `migrate-task-board.py`: novo script de migração

## Tests Updated

- `test_agents_lint_state_board.py`: formato 4 colunas (Task / State / Owner / Notes)
- `test_agents_lint_noise_reduction.py`: State Board sem coluna Checklist
- `test_agents_wb_update_task_marker.py`: testes com formato simplificado
- `test_verify_tasks_strict.py`: tasks em State Board (não checkboxes)

**All tests passing:** 68 tests, 0 failures

## Verification

```bash
# Migrate all task files
python3 .agents/scripts/migrate-task-board.py --all

# Validate structure
make doctor

# Lint docs
make lint

# Verify tasks
make verify

# Run tests
make test-scripts
```

## References

- Template: `docs/templates/task.md`
- Migration script: `.agents/scripts/migrate-task-board.py`
- Lint updater: `.agents/scripts/agents-lint-docs.py`
- Verify updater: `.agents/scripts/verify-tasks.py`

---

*Lesson created: 2026-02-27 | Migration: 14 files | Lines saved: ~10-20 per file | Tests: 68 passed*
