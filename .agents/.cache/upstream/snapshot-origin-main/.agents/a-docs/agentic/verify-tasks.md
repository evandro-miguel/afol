---
id: TOOL-009
theme: verify-tasks
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  lint_docs: ./agents-lint-docs.md
---

# verify-tasks.py - Verificação de Tarefas

## Por Que Existe

**Problema:** Workstreams podem ter tarefas pendentes sem aviso claro. Antes de marcar workstream como completa, é necessário:

- Verificar se todas tarefas estão completas
- Identificar tarefas bloqueadas
- Reportar status geral

**Solução:** Verificação automática que escaneia task files e reporta status.

## Função

Verifica conclusão de tarefas:

1. **Escaneia task files** - `*_task_*.md`
2. **Extrai tarefas** - Regex para markers
3. **Classifica status** - pending, in_progress, done, etc.
4. **Reporta** - Lista status de cada tarefa
5. **Exit code** - 0 se todas completas, 1 se pendências

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/wb/*/`*`_task_*.md` | Task files para verificar |

### Arquivos Escritos

| Arquivo | Propósito |
|---------|-----------|
| Nenhum | Apenas leitura e relatório |

## Como Configurar

### Task Markers

```python
MARKERS = {
    'pending': r'- \[ \]',
    'in_progress': r'- \[/\]',
    'ready_for_test': r'- \[%\]',
    'blocked': r'- \[!\]',
    'skipped': r'- \[>\]',
    'completed': r'- \[x\]',
}
```

## Como Modificar

### Adicionar Novo Status

```python
MARKERS['review'] = r'- \[@\]'  # Novo marker
MARKER_TO_STATUS['@'] = 'review'
```

### Alterar Formato de Task ID

Editar regex `TASK_LINE_RE`.

## Como Testar

```bash
# Verificar sessão específica
./.agents/agents verify-tasks .agents/wb/260223_1200_auth-refactor/

# Verificar diretório atual
./.agents/agents verify-tasks .

# Via Makefile
make verify

# Verificar exit code
echo $?  # 0 = todas completas, 1 = pendências
```

## Principais Funções

```python
extract_tasks()             # Extrai tarefas do markdown
classify_status()           # Classifica por marker
report_status()             # Imprime relatório
check_all_complete()        # Verifica se todas completas
```

---

*verify-tasks garante que workstreams estão realmente completas*
