---
id: TOOL-004
theme: agents-new
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  templates: ../../templates/
---

# agents-new.py - Creation de Workstreams

## Por Que Existe

**Problema:** Criar workstream manualmente requer:
- Nomear pasta corretamente (YYMMDD_HHMM_theme_type_N)
- Copiar templates
- Preencher frontmatter
- Atualizar .active_session

**Solução:** Automation que Creates estrutura completa com um comando.

## Function

Creates nova workstream com:

1. **Pasta de session** - Nome padronizado
2. **Plan file** - Planejamento
3. **Task file** - tasks com checklist
4. **Log file** - Timeline de atividades
5. **Spec file** (optional) - Especificação completa ou lite
6. **Updates .active_session** - Aponta para nova session

## O Que Tocar

### Files Lidos

| Arquivo | Purpose |
|---------|-----------|
| `.agents/agents.config` | Config de caminhos |
| `.agents/a-docs/templates/*.md` | Templates para copiar |

### Files Criados

```
.agents/wb/
└── YYMMDD_HHMM_<theme>/
    ├── YYMMDD_HHMM_<theme>_plan_01.md
    ├── YYMMDD_HHMM_<theme>_task_01.md
    ├── YYMMDD_HHMM_<theme>_log_01.md
    └── YYMMDD_HHMM_<theme>_spec_01.md (optional)
```

### Files Atualizados

| Arquivo | Change |
|---------|---------|
| `.agents/wb/.active_session` | Aponta para nova session |

## How to Configure

### Opções de Linha de Comando

```bash
# Básico (plan, task, log)
./.agents/agents new auth-refactor

# Com spec completo
./.agents/agents new api-endpoint --spec

# Com spec-lite
./.agents/agents new bugfix-login --spec-lite

# Apenas plan
./.agents/agents new quick-task --plan-only

# task rápida na session ativa
./.agents/agents new adicionar-log --quick
```

## How to Modify

### Adicionar Novo Tipo de Arquivo

1. Criar template em `.agents/a-docs/templates/`
2. Adicionar opção em `agents-new.py`
3. Registrar em `tools.json`

### Alterar Naming Convention

Editar Function `get_session_id()`:

```python
def get_session_id(theme: str) -> str:
    now = datetime.now(WB_TZ)
    date_part = now.strftime("%y%m%d_%H%M")
    theme_clean = theme.lower().replace(" ", "-")
    return f"{date_part}_{theme_clean}"
```

## How to Test

```bash
# Criar workstream
./.agents/agents new test-feature

# Verificar estrutura
ls -la .agents/wb/260223_*_test-feature/

# Verificar .active_session
cat .agents/wb/.active_session
```

## main Funções

```python
get_timestamp()           # Timestamp no timezone WB
get_session_id(theme)     # Gera ID da session
create_session_folder()   # Creates pasta
copy_template()           # Copia template
update_active_session()   # Updates ponteiro
```

---

*new padroniza Creation de workstreams*
