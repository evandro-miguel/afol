---
id: TOOL-002
theme: agents-tools
type: tool-doc
status: active
owner: system
created_at: 2026-02-23T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  wrapper: ./agents-wrapper.md
---

# agents-tools.py - Descoberta de Ferramentas

## Por Que Existe

**Problema:** Quando um agente autônomo recebe uma tarefa, ele precisa:
1. Descobrir qual ferramenta do sistema `.agents` usar
2. Entender os subcomandos e opções disponíveis
3. Aprender casos de uso sem ler código fonte

**Solução:** Uma ferramenta de descoberta que lista, busca e mostra detalhes de todas as ferramentas registradas em `tools.json`.

## Função

`agents-tools.py` é uma ferramenta de **descoberta e exploração** que:

1. **Lista** todas as ferramentas disponíveis agrupadas por tipo
2. **Busca** ferramentas por palavra-chave na descrição e casos de uso
3. **Mostra detalhes** de uma ferramenta específica incluindo subcomandos
4. **Guia o agente** no fluxo de descoberta → seleção → uso

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/tools.json` | Catálogo de ferramentas |
| `.agents/agents.config` | Configurações de caminho |

### Arquivos Escritos

| Arquivo | Propósito |
|---------|-----------|
| Nenhum | Ferramenta é apenas leitura |

### Output

| Tipo | Descrição |
|------|-----------|
| stdout | Listagem formatada, detalhes, resultados de busca |
| exit code | 0 = sucesso, 1 = erro (tool não encontrada, etc.) |

## Como Configurar

### Comandos Disponíveis

```bash
# Listar todas as ferramentas
./.agents/agents tools list

# Filtrar por tipo
./.agents/agents tools list --type validation
./.agents/agents tools list --type creation
./.agents/agents tools list --type automation

# Mostrar detalhes de uma ferramenta
./.agents/agents tools info doctor
./.agents/agents tools info wb-update

# Buscar por palavra-chave
./.agents/agents tools search valida
./.agents/agents tools search automate
./.agents/agents tools search create

# Ajuda
./.agents/agents tools help
```

### Opções

| Opção | Descrição |
|-------|-----------|
| `--type <type>` | Filtrar listagem por tipo (validation, creation, etc.) |

## Como Modificar

### Adicionar Novo Comando

Edite `agents-tools.py`:

```python
elif command == "new-command":
    # Implementar novo comando
    show_new_command_info(tools_data)
```

### Modificar Output

1. **List:** Editar função `list_tools()`
2. **Info:** Editar função `show_tool_info()`
3. **Search:** Editar função `search_tools()`

### Alterar Critério de Busca

Editar função `search_tools()`:

```python
def search_tools(tools_data: Dict[str, Any], query: str) -> None:
    # Campos buscados:
    # - tool["description"]
    # - tool["when_to_use"]
    # - tool["id"]
    # - tool["name"]
    
    # Score:
    # +5 para match em id
    # +4 para match em name
    # +3 para match em description
    # +2 para match em when_to_use
```

### Adicionar Novo Tipo

1. Adicionar tool com novo `type` em `tools.json`
2. Adicionar categoria em `tool_categories` no `tools.json`
3. Atualizar badge emoji em `format_type_badge()` se necessário

## Como Testar

### Testes Manuais

```bash
# 1. Listar todas
./.agents/agents tools list
# Esperado: Lista agrupada por tipo com 10+ tools

# 2. Filtrar por tipo
./.agents/agents tools list --type validation
# Esperado: Apenas doctor e lint-docs

# 3. Info de tool simples
./.agents/agents tools info doctor
# Esperado: Detalhes com description, when_to_use, commands

# 4. Info de tool com subcomandos
./.agents/agents tools info wb-update
# Esperado: Subcomandos listados (touch, task, status, etc.)

# 5. Search com match
./.agents/agents tools search valida
# Esperado: doctor, lint-docs, verify-tasks

# 6. Search sem match
./.agents/agents tools search xyz123
# Esperado: "No tools found" com sugestões

# 7. Info de tool inexistente
./.agents/agents tools info nonexistent
# Esperado: "Tool not found" com lista de tools disponíveis
```

### Testes de Validação

```bash
# Validar JSON antes
python -m json.tool .agents/tools.json > /dev/null && echo "✓ JSON válido"

# Contar tools
python3 -c "import json; print(len(json.load(open('.agents/tools.json'))['tools']))"
# Esperado: 10+

# Verificar wrapper
./.agents/agents tools help
# Esperado: Help message com todos os comandos
```

### Métricas de Saúde

| Métrica | Como Medir | Ideal |
|---------|------------|-------|
| List funciona | `.agents/agents tools list` | Output formatado |
| Info funciona | `.agents/agents tools info doctor` | Detalhes completos |
| Search funciona | `.agents/agents tools search valida` | Matches relevantes |
| Help funciona | `.agents/agents tools help` | Todos comandos listados |
| Exit codes | `echo $?` após erro | 1 para erros |

## Principais Funções

### Estrutura do Script

```python
# Funções principais
load_tools()           # Carrega tools.json
list_tools()           # Lista todas as tools
show_tool_info()       # Mostra detalhes de uma tool
search_tools()         # Busca por keyword
show_help()            # Mostra ajuda
main()                 # Entry point
```

### Função: load_tools

```python
def load_tools() -> Dict[str, Any]:
    """Load tools.json configuration."""
    if not TOOLS_JSON.exists():
        raise FileNotFoundError(f"Tools catalog not found: {TOOLS_JSON}")
    return json.loads(TOOLS_JSON.read_text())
```

### Função: list_tools

```python
def list_tools(tools_data: Dict[str, Any], filter_type: Optional[str] = None) -> None:
    """List all available tools with descriptions."""
    tools = tools_data["tools"]
    
    if filter_type:
        tools = [t for t in tools if t["type"] == filter_type]
    
    # Group by type
    by_type: Dict[str, List[Dict]] = {}
    for tool in tools:
        t = tool["type"]
        if t not in by_type:
            by_type[t] = []
        by_type[t].append(tool)
    
    # Print grouped output
    for tool_type, type_tools in sorted(by_type.items()):
        print(f"\n{format_type_badge(tool_type)}")
        # ... print tools
```

### Função: show_tool_info

```python
def show_tool_info(tools_data: Dict[str, Any], tool_id: str) -> None:
    """Show detailed information about a specific tool."""
    tool = next((t for t in tools if t["id"] == tool_id), None)
    
    if not tool:
        print(f"❌ Tool not found: {tool_id}")
        return
    
    # Print sections:
    # - ID, Type, Execution, Updated
    # - DESCRIPTION
    # - WHEN TO USE
    # - COMMANDS
    # - SUBCOMMANDS (if has "commands" field)
    # - OPTIONS (if has "options" field)
    # - CHECKS (if has "checks" field)
    # - TASK MARKERS (if has "task_markers" field)
```

### Função: search_tools

```python
def search_tools(tools_data: Dict[str, Any], query: str) -> None:
    """Search tools by query in description and when_to_use."""
    query_lower = query.lower()
    matches = []
    
    for tool in tools:
        score = 0
        matched_fields = []
        
        # Search in description (+3 points)
        if query_lower in tool["description"].lower():
            score += 3
            matched_fields.append("description")
        
        # Search in when_to_use (+2 points)
        for use in tool.get("when_to_use", []):
            if query_lower in use.lower():
                score += 2
                matched_fields.append("when_to_use")
                break
        
        # Search in id (+5 points)
        if query_lower in tool["id"].lower():
            score += 5
            matched_fields.append("id")
        
        # Search in name (+4 points)
        if query_lower in tool["name"].lower():
            score += 4
            matched_fields.append("name")
        
        if score > 0:
            matches.append((score, tool, matched_fields))
    
    # Sort by score (descending)
    matches.sort(key=lambda x: x[0], reverse=True)
```

### Algoritmo de Search

```
Input: query string
For each tool:
  - Check id (weight: 5)
  - Check name (weight: 4)
  - Check description (weight: 3)
  - Check each when_to_use entry (weight: 2)
  - Sum weights = score
Sort by score descending
Return matches with score > 0
```

## Fluxo do Agente

```
┌─────────────────────────────────────────────────────────┐
│  Agente recebe tarefa                                   │
│  Ex: "Valide a estrutura do projeto"                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Agente não sabe qual tool usar?                        │
│  → Executa: .agents/agents tools list                   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Vê tools agrupadas por tipo:                           │
│  [✓ validation] doctor, lint-docs                       │
│  [➕ creation] new                                      │
│  [⚙ automation] wb-update                               │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Identifica "doctor" como validação de estrutura        │
│  → Executa: .agents/agents tools info doctor            │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Recebe detalhes:                                       │
│  - Description: "Valida estrutura e integridade..."     │
│  - When to use: "Antes de iniciar trabalho..."          │
│  - Commands: .agents/agents doctor                      │
│  - Checks: Pastas, templates, frontmatter, etc.         │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Agente executa ferramenta:                             │
│  → .agents/agents doctor                                │
└─────────────────────────────────────────────────────────┘
```

## Troubleshooting

### Tool Não Aparece no List

```bash
# Verificar se tools.json é válido
python -m json.tool .agents/tools.json

# Verificar se tool está no array tools
python3 -c "import json; tools=json.load(open('.agents/tools.json'))['tools']; print([t['id'] for t in tools])"
```

### Info Não Mostra Subcomandos

1. Verificar se tool tem campo `"commands"` em tools.json
2. Verificar formato do array commands
3. Cada command deve ter: name, usage, description

### Search Não Encontra Tool

1. Search é case-insensitive
2. Verificar palavras em `description` e `when_to_use`
3. Adicionar sinônimos em `when_to_use`

### Erro "Tools catalog not found"

```bash
# Verificar caminho
ls -la .agents/tools.json

# Se não existir, o arquivo não foi criado
# Criar com: .agents/tools.json
```

## Referências

- [tools-json.md](./tools-json.md) - Catálogo de ferramentas
- [agents-wrapper.md](./agents-wrapper.md) - Wrapper bash
- [agents-config.md](./agents-config.md) - Config loader

---

*agents-tools.py é o ponto de entrada para descoberta de ferramentas*
