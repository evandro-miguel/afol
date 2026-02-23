---
id: TOOL-008
theme: sync-agent-docs
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  agents_md: ../../AGENTS.md
---

# sync-agent-docs.py - Synchronization de Documentation de Agentes

## Por Que Existe

**Problema:** Múltiplos agentes (QWEN, CLAUDE, GEMINI) têm Files de instruções separados. Manter sincronizado manualmente é:
- Propenso a errors
- Trabalhoso
- Causa inconsistência entre agentes

**Solução:** Synchronization automática a partir de um template central (AGENTS.md).

## Function

Sincroniza Files de agentes:

1. **Lê AGENTS.md** - Template central
2. **Detecta modificações locais** - Hash comparison
3. **Reporta diferenças** - Mostra o que mudou
4. **Pede confirmação** - before de sobrescrever
5. **Preserva headers** - Headers específicos por agente

## O Que Tocar

### Files Lidos

| Arquivo | Purpose |
|---------|-----------|
| `AGENTS.md` | Template central |
| `QWEN.md` | Instruções QWEN |
| `CLAUDE.md` | Instruções CLAUDE |
| `GEMINI.md` | Instruções GEMINI |

### Files Escritos

| Arquivo | Purpose |
|---------|-----------|
| `QWEN.md` | Atualizado do template |
| `CLAUDE.md` | Atualizado do template |
| `GEMINI.md` | Atualizado do template |

## How to Configure

### agents.config

```yaml
sync:
  source_file: AGENTS.md
  target_files:
    - QWEN.md
    - CLAUDE.md
    - GEMINI.md
```

### Header Template

```python
HEADER_TEMPLATE = """# Agent-specific instructions for {agent_name}
# Auto-synced from AGENTS.md - run `.agents/scripts/sync-agent-docs.py` to update

"""
```

## How to Modify

### Adicionar Novo Agente

1. Criar arquivo (ex: `COPILOT.md`)
2. Adicionar em `sync.target_files` no `agents.config`
3. Adicionar header específico se necessário

### Alterar Comportamento de Merge

Editar Function `merge_with_local_changes()`.

## How to Test

```bash
# Sync normal (pergunta before de sobrescrever)
./.agents/agents sync

# Forçar sync (sem perguntas)
./.agents/agents sync --force

# Via Makefile
make sync
```

## main Funções

```python
compute_hash()              # SHA256 do conteúdo
get_expected_content()      # Conteúdo esperado do template
detect_local_changes()      # Detecta modificações locais
merge_headers()             # Preserva headers específicos
sync_files()                # Executa Synchronization
```

---

*sync mantém agentes consistentes com instruções centralizadas*
