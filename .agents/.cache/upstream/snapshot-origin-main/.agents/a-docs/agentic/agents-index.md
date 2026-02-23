---
id: TOOL-005
theme: agents-index
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  structure_map: ./agents-structure-map.md
---

# agents-index.py - Atualização de Índices

## Por Que Existe

**Problema:** Specs e ADRs são criados em diretórios separados. Sem um índice centralizado, é difícil:
- Descobrir documentos existentes
- Ver status de cada documento
- Navegar entre documentos relacionados

**Solução:** Índices automáticos que agregam metadados de todos os documentos.

## Função

Escaneia diretórios e gera índices:

1. **SPECS/INDEX.md** - Lista todas as especificações
2. **DECISIONS/INDEX.md** - Lista todas as decisões de arquitetura

Extrai do frontmatter:
- ID, tema, status
- Owner, created_at, updated_at
- Links relacionados

## O Que Tocar

### Arquivos Lidos

| Diretório | Propósito |
|-----------|-----------|
| `.agents/arc/SPECS/**/*.md` | Specs para indexar |
| `.agents/arc/DECISIONS/**/*.md` | ADRs para indexar |

### Arquivos Escritos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/arc/SPECS/INDEX.md` | Índice de specs |
| `.agents/arc/DECISIONS/INDEX.md` | Índice de ADRs |

## Como Configurar

### agents.config

```yaml
paths:
  specs_dir: .agents/arc/SPECS
  decisions_dir: .agents/arc/DECISIONS
```

## Como Modificar

### Alterar Formato do Índice

Editar função `generate_index_md()`:

```python
def generate_index_md(entries: List[DocEntry], output_path: Path):
    # Formato atual:
    # | ID | Tema | Status | Owner | Created | Links |
    # Modificar conforme necessário
```

## Como Testar

```bash
# Executar index
./.agents/agents index

# Verificar índices
cat .agents/arc/SPECS/INDEX.md
cat .agents/arc/DECISIONS/INDEX.md

# Dry run (se implementado)
./.agents/agents index --dry-run
```

## Principais Funções

```python
scan_specs_dir()          # Escaneia SPECS
scan_decisions_dir()      # Escaneia DECISIONS
extract_frontmatter()     # Extrai metadados
generate_index_md()       # Gera INDEX.md
```

---

*index mantém documentação de arquitetura navegável*
