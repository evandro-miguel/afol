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

# agents-structure-map.py - Mapping de Estrutura

## Por Que Existe

**Problema:** Projetos crescem e a estrutura fica complexa. Novos desenvolvedores (ou agentes) precisam:
- Entender organização de Files
- Saber onde cada tipo de código vive
- Ter Overview do código

**Solução:** Geração automática de Documentation de estrutura com inventário de Files.

## Function

Escaneia projeto e gera Documentation:

1. **Inventário de Files** - Por categoria
2. **Line counts** - Tamanho de cada arquivo
3. **Descrições** - Extraídas de comentários/docstrings
4. **Agrupamento** - Frontend, Backend, Types, Tests, etc.
5. **Cache** - Para atualizações incrementais

## O Que Tocar

### Files Lidos

| Arquivo | Purpose |
|---------|-----------|
| Projeto alvo (ex: `.`) | Files para mapear |
| `.agents/agents.config` | Config de caminhos |

### Files Escritos

| Arquivo | Purpose |
|---------|-----------|
| `.agents/arc/structure/README.md` | Overview |
| `.agents/arc/structure/frontend.md` | Frontend |
| `.agents/arc/structure/backend.md` | Backend |
| `.agents/arc/structure/tests.md` | Tests |
| ... | Outras categorias |

## How to Configure

### Seções default

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

## How to Modify

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

Editar Function `generate_section_md()`.

## How to Test

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

## main Funções

```python
scan_directory()            # Escaneia Directory
categorize_file()           # Categoriza arquivo
count_lines()               # Conta linhas
extract_description()       # Extrai descrição
generate_section_md()       # Gera markdown
update_cache()              # Updates cache
```

---

*structure-map documenta Architecture de código automaticamente*
