---
id: AGENT-001
theme: agentic-tools-documentation
type: index
status: active
owner: system
created_at: 2026-02-23T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ../tools.json
  scripts_dir: ../scripts/
---

# Agentic Tools Documentation

**Purpose:** Documentação técnica das ferramentas do sistema `.agents` para agentes autônomos.

**Audience:** Agentes de IA (QWEN, CLAUDE, GEMINI) que operam neste repositório.

---

## Visão Geral

Este diretório contém documentação técnica detalhada de cada ferramenta operacional do sistema `.agents`. Cada documento responde:

1. **Por que existe** - Problema que resolve
2. **Função** - O que faz
3. **O que tocar** - Arquivos que lê/escreve
4. **Como configurar** - Configurações relevantes
5. **Como modificar** - Guia de manutenção
6. **Como testar** - Métricas de funcionamento
7. **Principais funções** - Código chave

---

## Ferramentas Documentadas

### Core Tools

| Tool | Tipo | Documento |
|------|------|-----------|
| `tools` | discovery | [agents-tools.md](./agents-tools.md) |
| `doctor` | validation | [agents-doctor.md](./agents-doctor.md) |
| `new` | creation | [agents-new.md](./agents-new.md) |
| `index` | documentation | [agents-index.md](./agents-index.md) |
| `lint-docs` | validation | [agents-lint-docs.md](./agents-lint-docs.md) |
| `structure-map` | documentation | [agents-structure-map.md](./agents-structure-map.md) |
| `sync` | synchronization | [sync-agent-docs.md](./sync-agent-docs.md) |
| `verify-tasks` | verification | [verify-tasks.md](./verify-tasks.md) |
| `wb-update` | automation | [agents-wb-update.md](./agents-wb-update.md) |

### Infrastructure

| Component | Tipo | Documento |
|-----------|------|-----------|
| `agents` (wrapper) | infrastructure | [agents-wrapper.md](./agents-wrapper.md) |
| `Makefile` | infrastructure | [makefile.md](./makefile.md) |
| `tools.json` | configuration | [tools-json.md](./tools-json.md) |
| `agents_config.py` | library | [agents-config.md](./agents-config.md) |

---

## Padrão de Documentação

Cada ferramenta segue esta estrutura:

```markdown
---
id: TOOL-XXX
theme: <tool-name>
type: tool-doc
status: <draft|active|final>
owner: system
created_at: <date>
updated_at: <date>
---

# <Tool Name>

## Por Que Existe

## Função

## O Que Tocar

## Como Configurar

## Como Modificar

## Como Testar

## Principais Funções
```

---

## Como Usar Esta Documentação

### Para Agentes

1. **Descobrir ferramentas:** Use `.agents/agents tools list`
2. **Entender ferramenta:** Leia o documento correspondente neste diretório
3. **Usar ferramenta:** Siga exemplos de uso no documento
4. **Troubleshoot:** Consulte seção "Como Testar"

### Para Humanos

1. **Entender sistema:** Comece por [tools-json.md](./tools-json.md)
2. **Modificar ferramenta:** Leia "Como Modificar" do documento específico
3. **Adicionar ferramenta:** Siga padrão de documentação

---

## Arquitetura

```
.agents/
├── agents              # Wrapper bash (CLI entry point)
├── tools.json          # Catálogo de ferramentas (JSON)
├── agents.config       # Configuração central (YAML)
├── scripts/
│   ├── agents-tools.py         # Descoberta
│   ├── agents-doctor.py        # Validação
│   ├── agents-new.py           # Criação
│   ├── agents-index.py         # Indexação
│   ├── agents-lint-docs.py     # Linting
│   ├── agents-structure-map.py # Mapeamento
│   ├── sync-agent-docs.py      # Sincronização
│   ├── verify-tasks.py         # Verificação
│   ├── agents-wb-update.py     # Automação WB
│   └── lib/
│       └── agents_config.py    # Config loader
└── a-docs/
    └── agentic/        # Esta documentação
```

---

## Fluxo Típico do Agente

```
1. Agente recebe tarefa
   ↓
2. Não sabe qual ferramenta usar?
   → .agents/agents tools list
   → .agents/agents tools search <keyword>
   ↓
3. Identifica ferramenta
   → Lê documentação em .agents/a-docs/agentic/
   ↓
4. Obtém detalhes da ferramenta
   → .agents/agents tools info <tool-id>
   ↓
5. Executa ferramenta
   → .agents/agents <command> [args]
   ↓
6. Verifica resultado
   → Checa output e exit code
```

---

## Métricas de Saúde

| Métrica | Como Medir | Ideal |
|---------|------------|-------|
| Tools funcionais | `.agents/agents tools list` | 10+ tools |
| Documentação completa | Contar arquivos em `agentic/` | 1 doc por tool |
| Configuração válida | `python -m json.tool .agents/tools.json` | JSON válido |
| Wrapper funcional | `.agents/agents help` | Lista todos commands |

---

## Changelog

| Data | Mudança |
|------|---------|
| 2026-02-23 | Criação da documentação agentic |
| 2026-02-23 | Adicionado tools discovery |
| 2026-02-23 | Movido agents.config para .agents/ |

---

*Documentação mantida para agentes autônomos operarem com eficiência no sistema .agents*
