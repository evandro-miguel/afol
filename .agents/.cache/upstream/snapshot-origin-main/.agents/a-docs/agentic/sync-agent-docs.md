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

# sync-agent-docs.py - Sincronização de Documentação de Agentes

## Por Que Existe

**Problema:** Múltiplos agentes (QWEN, CLAUDE, GEMINI) têm arquivos de instruções separados. Manter sincronizado manualmente é:

- Propenso a erros
- Trabalhoso
- Causa inconsistência entre agentes

**Solução:** Sincronização automática a partir de um template central (AGENTS.md).

## Função

Sincroniza arquivos de agentes:

1. **Lê AGENTS.md** - Template central
2. **Detecta modificações locais** - Hash comparison
3. **Reporta diferenças** - Mostra o que mudou
4. **Pede confirmação** - Antes de sobrescrever
5. **Preserva headers** - Headers específicos por agente

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| `AGENTS.md` | Template central |
| `QWEN.md` | Instruções QWEN |
| `CLAUDE.md` | Instruções CLAUDE |
| `GEMINI.md` | Instruções GEMINI |

### Arquivos Escritos

| Arquivo | Propósito |
|---------|-----------|
| `QWEN.md` | Atualizado do template |
| `CLAUDE.md` | Atualizado do template |
| `GEMINI.md` | Atualizado do template |

## Como Configurar

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

## Como Modificar

### Adicionar Novo Agente

1. Criar arquivo (ex: `COPILOT.md`)
2. Adicionar em `sync.target_files` no `agents.config`
3. Adicionar header específico se necessário

### Alterar Comportamento de Merge

Editar função `merge_with_local_changes()`.

## Como Testar

```bash
# Sync normal (pergunta antes de sobrescrever)
./.agents/agents sync

# Forçar sync (sem perguntas)
./.agents/agents sync --force

# Via Makefile
make sync
```

## Principais Funções

```python
compute_hash()              # SHA256 do conteúdo
get_expected_content()      # Conteúdo esperado do template
detect_local_changes()      # Detecta modificações locais
merge_headers()             # Preserva headers específicos
sync_files()                # Executa sincronização
```

---

*sync mantém agentes consistentes com instruções centralizadas*
