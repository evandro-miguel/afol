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

# agents-lint-docs.py - Validação de Documentos Markdown

## Por Que Existe

**Problema:** Documentos markdown podem ter inconsistências:

- Checkboxes em formatos diferentes
- Status inválidos no frontmatter
- IDs de tarefa fora do padrão
- Cross-referências quebradas

**Solução:** Linter específico para documentos `.agents` que valida convenções.

## Função

Valida documentos markdown:

1. **Checkbox markers** - `- [X]`, `- [/]`, `- [ ]`
2. **Status fields** - draft, active, review, approved, etc.
3. **State values** - pending, in_progress, done, etc.
4. **Frontmatter** - Campos obrigatórios
5. **Cross-references** - Links entre documentos
6. **Task IDs** - Padrão T-NN

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/wb/**/*.md` | Workstreams |
| `.agents/arc/**/*.md` | Arquitetura |
| `.agents/agents.config` | Exclusões de lint |

### Arquivos Escritos

| Arquivo | Propósito |
|---------|-----------|
| Nenhum (modo normal) | Apenas validação |
| Mesmos arquivos (modo --fix) | Corrige issues |

## Como Configurar

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

## Como Modificar

### Adicionar Nova Validação

```python
def check_new_rule(content: str, file_path: Path):
    """Nova regra de lint."""
    issues = []
    # Implementar lógica
    return issues
```

### Adicionar Novo Status

Editar `VALID_STATUSES` em `agents-lint-docs.py`.

## Como Testar

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

## Principais Funções

```python
check_checkbox_markers()    # Valida checkboxes
check_status_fields()       # Valida status
check_frontmatter()         # Valida frontmatter
check_task_ids()            # Valida T-NN
check_cross_references()    # Valida links
fix_issues()                # Auto-correção
```

---

*lint-docs mantém consistência da documentação*
