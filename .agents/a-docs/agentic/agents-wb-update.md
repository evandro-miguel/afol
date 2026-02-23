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

# agents-wb-update.py - Automation de Workbench

## Por Que Existe

**Problema:** Manter workbench atualizado requer tasks repetitivas de baixo valor:
- Atualizar `updated_at` no frontmatter
- Normalizar timestamps
- Atualizar lista de Files modificados
- Marcar tasks como completas
- Adicionar entradas de timeline

**Solução:** Automation que executa essas tasks com um comando.

## Function

Automatiza atualizações de workbench:

1. **touch** - Updates `updated_at`
2. **normalize-time** - Normaliza timestamps para WB timezone
3. **files-changed** - Updates seção "Files Changed" no report
4. **task** - Marca task por ID (done, in_progress, etc.)
5. **status** - Setar status no frontmatter
6. **timeline** - Adiciona entrada de timeline no log
7. **link** - Setar `links.<key>` no frontmatter

## O Que Tocar

### Files Lidos

| Arquivo | Purpose |
|---------|-----------|
| `.agents/wb/.active_session` | session ativa |
| `.agents/wb/*/*.md` | Documentos da session |
| `.agents/agents.config` | Config (WB_OFFSET, etc.) |

### Files Escritos

| Comando | Arquivo | Change |
|---------|---------|---------|
| `touch` | Session files | `updated_at` no frontmatter |
| `task` | `*_task_*.md` | Marker da task |
| `status` | Session files | `status` no frontmatter |
| `timeline` | `*_log_*.md` | Entrada na timeline |
| `files-changed` | `*_report_*.md` | Lista de Files |
| `link` | Session files | `links.<key>` no frontmatter |

## How to Configure

### agents.config

```yaml
time:
  wb_offset: "-03:00"  # Timezone do workbench
```

## How to Modify

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

## How to Test

```bash
# Touch (atualizar updated_at)
./.agents/agents wb-update touch

# Normalizar timestamps
./.agents/agents wb-update normalize-time --all-wb

# Atualizar files changed
./.agents/agents wb-update files-changed

# Marcar task
./.agents/agents wb-update task T-01 --mark-done
./.agents/agents wb-update task T-02 --mark-in-progress

# Setar status
./.agents/agents wb-update status --value active --file plan

# Adicionar timeline
./.agents/agents wb-update timeline --message "Implementação concluída"

# Setar link
./.agents/agents wb-update link --file plan --key related --value "260220_1000_other-session"
```

## main Funções

```python
get_active_session()      # Lê .active_session
update_frontmatter()      # Updates frontmatter YAML
mark_task()               # Marca task
append_timeline()         # Adiciona timeline entry
update_files_changed()    # Updates lista de Files
normalize_timestamps()    # Normaliza para WB timezone
```

---

*wb-update automatiza trabalho repetitivo de manutenção de docs*
