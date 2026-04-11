---
id: TOOL-001
theme: tools-json
type: tool-doc
status: active
owner: system
created_at: 2026-02-23T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  agents_config: ../agents.config
  agents_tools: ./agents-tools.md
---

# tools.json - Catálogo de Ferramentas

## Por Que Existe

**Problema:** Agentes autônomos precisam descobrir quais ferramentas estão disponíveis, quando usá-las, e como obter detalhes sobre subcomandos e opções.

**Solução:** Um arquivo JSON centralizado que documenta todas as ferramentas do sistema `.agents` com:

- Descrições claras
- Casos de uso (when_to_use)
- Comandos e opções
- Classificação por tipo
- Metadados de execução

## Função

`tools.json` serve como:

1. **Catálogo de ferramentas** - Lista todas as ferramentas disponíveis
2. **Guia de descoberta** - Usado por `agents-tools.py` para comandos `list`, `info`, `search`
3. **Referência técnica** - Documenta subcomandos, opções, e padrões de uso
4. **Classificador** - Categoriza ferramentas por tipo e modo de execução

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/tools.json` | Fonte primária (este arquivo) |
| `.agents/agents.config` | Configurações de caminho |

### Arquivos Escritos

| Arquivo | Propósito |
|---------|-----------|
| Nenhum | tools.json é apenas leitura em runtime |

### Arquivos Atualizados (edição humana)

| Arquivo | Quando |
|---------|--------|
| `.agents/tools.json` | Ao adicionar nova ferramenta |

## Como Configurar

### Estrutura do JSON

```json
{
  "version": "1.0.0",
  "updated_at": "2026-02-23T00:00:00-03:00",
  "description": "Catálogo de ferramentas...",
  "tools": [...],
  "makefile_targets": {...},
  "tool_categories": {...},
  "execution_modes": {...},
  "makefile_aliases": {...},
  "best_practices": [...]
}
```

### Seções Principais

#### `tools` (array)

Lista de todas as ferramentas. Cada tool tem:

```json
{
  "id": "doctor",
  "name": "Agents Doctor",
  "tool": "agents-doctor.py",
  "wrapper_command": ".agents/agents doctor",
  "make_command": "make doctor",
  "type": "validation",
  "execution_mode": "on-demand",
  "created_at": "2026-02-20",
  "updated_at": "2026-02-23",
  "description": "...",
  "when_to_use": ["...", "..."],
  "commands": [...],  // opcional, para subcomandos
  "options": [...],   // opcional
  "checks": [...]     // opcional
}
```

#### `tool_categories`

Classificação por tipo:

```json
{
  "validation": { "description": "...", "tools": ["doctor", "lint-docs"] },
  "creation": { "description": "...", "tools": ["new"] },
  "documentation": { "description": "...", "tools": ["index", "structure-map"] },
  "verification": { "description": "...", "tools": ["verify-tasks"] },
  "automation": { "description": "...", "tools": ["wb-update"] },
  "synchronization": { "description": "...", "tools": ["sync"] },
  "infrastructure": { "description": "...", "tools": ["agents"] },
  "discovery": { "description": "...", "tools": ["tools"] }
}
```

#### `execution_modes`

Padrões de execução:

```json
{
  "on-demand": { "description": "...", "tools": [...] },
  "cron": { "description": "...", "tools": [], "suggested": [...] },
  "event-driven": { "description": "...", "tools": {...} }
}
```

#### `makefile_aliases`

Aliases de atalho no Makefile:

```json
{
  "note": "Aliases de atalho no Makefile...",
  "aliases": {
    "st": "structure",
    "ix": "index",
    "sy": "sync",
    "vf": "verify",
    "dr": "doctor"
  },
  "warning": "doc NÃO é um alias valido..."
}
```

## Como Modificar

### Adicionar Nova Ferramenta

1. **Criar script** em `.agents/scripts/<tool>.py`
2. **Registrar no wrapper** `.agents/agents`
3. **Adicionar entrada em `tools`**:

```json
{
  "id": "my-new-tool",
  "name": "My New Tool",
  "tool": "agents-my-new-tool.py",
  "wrapper_command": ".agents/agents my-new-tool [args]",
  "make_command": "make my-new-tool",
  "type": "validation",
  "execution_mode": "on-demand",
  "created_at": "2026-02-23",
  "updated_at": "2026-02-23",
  "description": "Descrição clara da ferramenta",
  "when_to_use": [
    "Caso de uso 1",
    "Caso de uso 2"
  ]
}
```

4. **Adicionar à categoria** em `tool_categories`
5. **Validar JSON**: `python -m json.tool .agents/tools.json`

### Atualizar Ferramenta Existente

1. Localizar tool por `id` em `tools` array
2. Atualizar campos relevantes
3. Atualizar `updated_at` no metadata da tool
4. Atualizar `updated_at` no root do JSON
5. Validar JSON

### Remover Ferramenta

1. Remover entrada de `tools` array
2. Remover de `tool_categories` se aplicável
3. Atualizar `execution_modes` se aplicável
4. Validar JSON

## Como Testar

### Validação de Sintaxe

```bash
# Validar JSON
python -m json.tool .agents/tools.json > /dev/null && echo "✓ Válido"
```

### Validação de Conteúdo

```bash
# Contar ferramentas
python3 -c "import json; d=json.load(open('.agents/tools.json')); print(f'Tools: {len(d[\"tools\"])}')"

# Listar categorias
python3 -c "import json; d=json.load(open('.agents/tools.json')); print('Categories:', list(d['tool_categories'].keys()))"
```

### Validação de Uso

```bash
# Testar list
./.agents/agents tools list

# Testar info
./.agents/agents tools info doctor

# Testar search
./.agents/agents tools search valida
```

### Métricas de Saúde

| Métrica | Comando | Ideal |
|---------|---------|-------|
| JSON válido | `python -m json.tool` | Sem erros |
| Tools count | `len(tools)` | 10+ |
| Categorias | `len(tool_categories)` | 8 |
| Info funciona | `.agents/agents tools info <id>` | Output correto |

## Principais Funções

### Estrutura de uma Tool Entry

```python
# Exemplo de estrutura completa
{
    "id": "wb-update",
    "name": "Agents Workbench Update",
    "tool": "agents-wb-update.py",
    "wrapper_command": ".agents/agents wb-update <command> [options]",
    "make_command": "make wb-<command> [ARGS...]",
    "type": "automation",
    "execution_mode": "on-demand",
    "created_at": "2026-02-23",
    "updated_at": "2026-02-23",
    "description": "Automatiza atualizações de baixo valor...",
    "when_to_use": [
        "Atualizar updated_at após trabalhar em sessão",
        "Normalizar timestamps para timezone configurado",
        "Marcar tarefa como completa/em progresso"
    ],
    "commands": [
        {
            "name": "touch",
            "usage": "wb-update touch",
            "description": "Atualiza updated_at no frontmatter"
        },
        # ... mais subcomandos
    ],
    "options": ["--force", "--dry-run"],  # se aplicável
    "checks": ["Check 1", "Check 2"]      # se aplicável
}
```

### Campos Obrigatórios

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | Identificador único (kebab-case) |
| `name` | string | Nome legível |
| `tool` | string | Nome do arquivo Python |
| `wrapper_command` | string | Comando via wrapper |
| `make_command` | string | Comando via Makefile |
| `type` | string | Categoria (validation, creation, etc.) |
| `execution_mode` | string | on-demand, cron, event-driven |
| `description` | string | Descrição clara |
| `when_to_use` | array | Casos de uso |

### Campos Opcionais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `commands` | array | Subcomandos (para tools com subcommands) |
| `options` | array | Opções de linha de comando |
| `checks` | array | Checks realizados (para validation tools) |
| `task_markers` | object | Markers de tarefa (para verify-tasks) |
| `workflow` | array | Passo a passo de uso |

## Troubleshooting

### JSON Inválido

```bash
# Identificar erro
python -m json.tool .agents/tools.json 2>&1 | head -5

# Comum: vírgula faltando ou aspas não escapadas
```

### Tool Não Aparece no List

1. Verificar se está em `tools` array
2. Verificar se JSON é válido
3. Recarregar: `.agents/agents tools list`

### Search Não Encontra Tool

1. Verificar campos `description` e `when_to_use`
2. Adicionar palavras-chave relevantes
3. Search é case-insensitive

## Referências

- [agents-tools.md](./agents-tools.md) - Ferramenta que consome este catálogo
- [agents-config.md](./agents-config.md) - Configuração central
- [agents-wrapper.md](./agents-wrapper.md) - Wrapper bash

---

*tools.json é o coração do sistema de descoberta de ferramentas*
