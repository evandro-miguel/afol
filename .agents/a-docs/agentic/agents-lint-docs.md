---
id: TOOL-006
theme: agents-lint-docs
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  doctor: ./agents-doctor.md
---

# agents-lint-docs.py - Validation de Documentos Markdown

## Por Que Existe

**Problema:** Documentos markdown podem ter inconsistências:
- Checkboxes em formatos diferentes
- Status inválidos no frontmatter
- IDs de task fora do default
- Cross-referências quebradas

**Solução:** Linter específico para documentos `.agents` que Validates convenções.

## Function

Validates documentos markdown:

1. **Checkbox markers** - `- [X]`, `- [/]`, `- [ ]`
2. **Status fields** - draft, active, review, approved, etc.
3. **State values** - pending, in_progress, done, etc.
4. **Frontmatter** - Campos obrigatórios
5. **Cross-references** - Links entre documentos
6. **Task IDs** - default T-NN

## O Que Tocar

### Files Lidos

| Arquivo | Purpose |
|---------|-----------|
| `.agents/wb/**/*.md` | Workstreams |
| `.agents/arc/**/*.md` | Architecture |
| `.agents/agents.config` | Exclusões de lint |

### Files Escritos

| Arquivo | Purpose |
|---------|-----------|
| Nenhum (modo normal) | Apenas Validation |
| Mesmos Files (modo --fix) | Corrige issues |

## How to Configure

### agents.config

```yaml
lint:
  excluded_path_prefixes:
    - a-docs/
    - arc/structure/
    - scripts/.agent/docs/
    - z-arq/
```

### Status Válidos

```python
VALID_STATUSES = [
    "draft", "active", "review", "approved", "final",
    "deprecated", "superseded", "done", "blocked"
]
```

## How to Modify

### Adicionar Nova Validation

```python
def check_new_rule(content: str, file_path: Path):
    """Nova regra de lint."""
    issues = []
    # Implementar lógica
    return issues
```

### Adicionar Novo Status

Editar `VALID_STATUSES` em `agents-lint-docs.py`.

## How to Test

```bash
# Lint em pasta específica
./.agents/agents lint-docs .agents/wb/260223_1200_auth-refactor/

# Lint em tudo
./.agents/agents lint-docs .agents/

# Com auto-fix
./.agents/agents lint-docs .agents/wb --fix

# Via Makefile
make lint
```

## main Funções

```python
check_checkbox_markers()    # Validates checkboxes
check_status_fields()       # Validates status
check_frontmatter()         # Validates frontmatter
check_task_ids()            # Validates T-NN
check_cross_references()    # Validates links
fix_issues()                # Auto-correção
```

---

*lint-docs mantém consistência da Documentation*
