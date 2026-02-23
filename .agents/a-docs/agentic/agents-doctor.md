---
id: TOOL-003
theme: agents-doctor
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  lint_docs: ./agents-lint-docs.md
---

# agents-doctor.py - Validação de Estrutura

## Por Que Existe

**Problema:** O sistema `.agents` requer estrutura específica de pastas, templates, e convenções de nomenclatura. Erros na estrutura causam falhas em cascata nas outras ferramentas.

**Solução:** Validação automática que verifica integridade da estrutura antes que problemas ocorram.

## Função

Valida a estrutura do diretório `.agents`:

1. **Pastas obrigatórias** - Verifica existência
2. **Templates** - Verifica presença de todos os templates
3. **Frontmatter YAML** - Valida sintaxe
4. **IDs** - Verifica convenção (YYMMDD_HHMM_theme_type_N)
5. **Timestamps** - Valida formato ISO 8601
6. **Cross-links** - Verifica links entre documentos

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/agents.config` | Config (required_folders, required_templates) |
| `.agents/a-docs/templates/*.md` | Templates |
| `.agents/wb/**/*.md` | Workstreams para validar |
| `.agents/arc/SPECS/**/*.md` | Specs para validar |
| `.agents/arc/DECISIONS/**/*.md` | ADRs para validar |

### Arquivos Escritos

| Arquivo | Propósito |
|---------|-----------|
| Nenhum | Apenas leitura e validação |

### Output

```
✓ a-docs/templates
✓ a-docs/standards
✓ wb
❌ arc/SPECS/INDEX.md - Missing file
⚠️  260223_1200_auth-refactor_plan_01.md - Invalid timestamp format
```

## Como Configurar

### agents.config

```yaml
doctor:
  required_folders:
    - a-docs/templates
    - a-docs/standards
    - a-docs/lessons
    - arc
    - arc/SPECS
    - arc/DECISIONS
    - wb
    - rules
    - scripts
    - skills
  required_templates:
    - plan.md
    - task.md
    - report.md
    - log.md
    - spec.md
    - spec-lite.md
    - adr.md
```

## Como Modificar

### Adicionar Nova Validação

```python
# Em agents-doctor.py
def check_new_validation():
    """Nova validação."""
    issues = []
    # Implementar lógica
    return issues
```

### Alterar Pastas Obrigatórias

Editar `agents.config`:

```yaml
doctor:
  required_folders:
    - nova-pasta  # Adicionar
```

## Como Testar

```bash
# Executar doctor
./.agents/agents doctor

# Via Makefile
make doctor

# Esperado: 
# ✓ para todos os checks
# ou ❌/⚠️ com descrição do problema
```

### Métricas de Saúde

| Métrica | Ideal |
|---------|-------|
| Pastas existentes | 100% |
| Templates existentes | 100% |
| Frontmatter válido | 100% |
| IDs no padrão | 100% |

## Principais Funções

```python
# Validações
check_required_folders()
check_templates()
check_frontmatter()
check_ids_convention()
check_timestamps()
check_cross_links()

# Issue classes
class Issue:
    severity: "error" | "warning" | "info"
    path: str
    message: str
```

---

*doctor previne problemas de estrutura antes que causem falhas*
