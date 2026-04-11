---
id: TOOL-010
theme: agents-wb-update
type: tool-doc
status: active
owner: system
created_at: 2026-02-23T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  new: ./agents-new.md
---

# agents-wb-update.py - Automação de Workbench

## Por Que Existe

**Problema:** Manter workbench atualizado requer tarefas repetitivas de baixo valor:

- Atualizar `updated_at` no frontmatter
- Normalizar timestamps
- Atualizar lista de arquivos modificados
- Marcar tarefas como completas
- Adicionar entradas de timeline

**Solução:** Automação que executa essas tarefas com um comando.

## Função

Automatiza atualizações de workbench:

1. **touch** - Atualiza `updated_at`
2. **normalize-time** - Normaliza timestamps para WB timezone
3. **files-changed** - Atualiza seção "Files Changed" no report
4. **task** - Marca tarefa por ID (done, in_progress, etc.)
5. **status** - Setar status no frontmatter
6. **timeline** - Adiciona entrada de timeline no log
7. **link** - Setar `links.<key>` no frontmatter

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/wb/.active_session` | Sessão ativa |
| `.agents/wb/*/*.md` | Documentos da sessão |
| `.agents/agents.config` | Config (WB_OFFSET, etc.) |

### Arquivos Escritos

| Comando | Arquivo | Mudança |
|---------|---------|---------|
| `touch` | Session files | `updated_at` no frontmatter |
| `task` | `*_task_*.md` | Marker da tarefa |
| `status` | Session files | `status` no frontmatter |
| `timeline` | `*_log_*.md` | Entrada na timeline |
| `files-changed` | `*_report_*.md` | Lista de arquivos |
| `link` | Session files | `links.<key>` no frontmatter |

## Como Configurar

### agents.config

```yaml
time:
  wb_offset: "-03:00"  # Timezone do workbench
```

## Como Modificar

### Adicionar Novo Subcomando

```python
def cmd_new_command(args):
    """Novo subcomando."""
    session = get_active_session()
    # Implementar lógica
    save_session(session)
```

### Alterar Timezone

Editar `WB_OFFSET` em `agents.config`.

## Como Testar

```bash
# Touch (atualizar updated_at)
./.agents/agents wb-update touch

# Normalizar timestamps
./.agents/agents wb-update normalize-time --all-wb

# Atualizar files changed
./.agents/agents wb-update files-changed

# Marcar tarefa
./.agents/agents wb-update task T-01 --mark-done
./.agents/agents wb-update task T-02 --mark-in-progress

# Setar status
./.agents/agents wb-update status --value active --file plan

# Adicionar timeline
./.agents/agents wb-update timeline --message "Implementação concluída"

# Setar link
./.agents/agents wb-update link --file plan --key related --value "260220_1000_other-session"
```

## Principais Funções

```python
get_active_session()      # Lê .active_session
update_frontmatter()      # Atualiza frontmatter YAML
mark_task()               # Marca tarefa
append_timeline()         # Adiciona timeline entry
update_files_changed()    # Atualiza lista de arquivos
normalize_timestamps()    # Normaliza para WB timezone
```

---

*wb-update automatiza trabalho repetitivo de manutenção de docs*
