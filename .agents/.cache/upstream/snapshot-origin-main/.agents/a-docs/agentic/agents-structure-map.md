---
id: TOOL-007
theme: agents-structure-map
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  index: ./agents-index.md
---

# agents-structure-map.py - Mapeamento de Estrutura

## Por Que Existe

**Problema:** Projetos crescem e a estrutura fica complexa. Novos desenvolvedores (ou agentes) precisam:

- Entender organização de arquivos
- Saber onde cada tipo de código vive
- Ter visão geral do código

**Solução:** Geração automática de documentação de estrutura com inventário de arquivos.

## Função

Escaneia projeto e gera documentação:

1. **Inventário de arquivos** - Por categoria
2. **Line counts** - Tamanho de cada arquivo
3. **Descrições** - Extraídas de comentários/docstrings
4. **Agrupamento** - Frontend, Backend, Types, Tests, etc.
5. **Cache** - Para atualizações incrementais

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| Projeto alvo (ex: `.`) | Arquivos para mapear |
| `.agents/agents.config` | Config de caminhos |

### Arquivos Escritos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/arc/structure/README.md` | Visão geral |
| `.agents/arc/structure/frontend.md` | Frontend |
| `.agents/arc/structure/backend.md` | Backend |
| `.agents/arc/structure/tests.md` | Tests |
| ... | Outras categorias |

## Como Configurar

### Seções Padrão

```python
DEFAULT_SECTIONS = {
    "frontend": {
        "patterns": ["components", "hooks", "ui"],
        "extensions": [".tsx", ".jsx", ".vue"],
        "title": "Frontend",
        "description": "React components, hooks, and UI elements"
    },
    "backend": {
        "patterns": ["services", "api", "utils"],
        "extensions": [".ts", ".py", ".go"],
        "title": "Backend"
    },
    "tests": {
        "patterns": ["test", "spec", "__tests__"],
        "extensions": [".test.ts", ".spec.py"],
        "title": "Tests"
    }
}
```

## Como Modificar

### Adicionar Nova Seção

```python
DEFAULT_SECTIONS["mobile"] = {
    "patterns": ["mobile", "react-native"],
    "extensions": [".tsx"],
    "title": "Mobile",
    "description": "React Native components"
}
```

### Alterar Output

Editar função `generate_section_md()`.

## Como Testar

```bash
# Mapear projeto atual
./.agents/agents structure-map .

# Output customizado
./.agents/agents structure-map . --output .agents/arc/structure/

# Via Makefile
make structure

# Verificar output
cat .agents/arc/structure/README.md
```

## Principais Funções

```python
scan_directory()            # Escaneia diretório
categorize_file()           # Categoriza arquivo
count_lines()               # Conta linhas
extract_description()       # Extrai descrição
generate_section_md()       # Gera markdown
update_cache()              # Atualiza cache
```

---

*structure-map documenta arquitetura de código automaticamente*
