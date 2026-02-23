---
id: TOOL-012
theme: makefile
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  wrapper: ./agents-wrapper.md
---

# Makefile - Targets e Aliases

## Por Que Existe

**Problema:** Comandos `.agents/agents` são verbosos para uso frequente. Desenvolvedores preferem:
- Comandos curtos
- Autocomplete do shell
- Workflows compostos

**Solução:** Makefile com targets nomeados e aliases curtos.

## Função

Fornece:

1. **Targets nomeados** - `make doctor`, `make new`
2. **Aliases curtos** - `st`, `ix`, `sy`, `vf`, `dr`
3. **Workflows compostos** - `make all`, `make refresh`
4. **Variáveis** - `THEME=`, `TASK_ID=`, etc.

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/a-docs/standards/Makefile` | Makefile principal |
| `.agents/agents.config` | Configurações |

### Arquivos Executados

| Target | Comando Executado |
|--------|-------------------|
| `make doctor` | `.agents/agents doctor` |
| `make new THEME=x` | `.agents/agents new x` |
| `make verify` | `.agents/agents verify-tasks` |

## Como Configurar

### Targets Principais

```makefile
make setup        # Setup do virtualenv
make doctor       # Validação de estrutura
make new          # Criar workstream (THEME=required)
make structure    # Gerar docs de estrutura
make index        # Atualizar índices
make sync         # Sincronizar agent docs
make verify       # Verificar tarefas
make lint         # Lint de markdown
make all          # Validação completa
```

### Aliases Curtos

```makefile
st: structure     # structure
ix: index         # index
sy: sync          # sync
vf: verify        # verify
dr: doctor        # doctor (NÃO use doc!)
```

### Targets com Variáveis

```makefile
make new THEME=auth-refactor
make wb-task TASK_ID=T-01 ACTION=done
make wb-status STATUS=active
make wb-timeline MSG="Implementação concluída"
make wb-link FILE=plan KEY=related VALUE=xxx
```

## Como Modificar

### Adicionar Novo Target

```makefile
new-target:
	@echo "→ Executando novo target..."
	@./.agents/agents new-command args
	@echo "✓ Concluído"
```

### Adicionar Alias

```makefile
nt: new-target  # Alias curto
```

## Como Testar

```bash
# Help
make help

# Setup
make setup

# Validação
make doctor
make lint
make verify

# Workflow completo
make all  # doctor + structure + index + verify

# Criar workstream
make new THEME=test-feature

# Aliases
make st  # structure
make dr  # doctor
```

## Principais Targets

### Setup & Maintenance

```makefile
setup     # Initialize UV virtualenv
clean     # Remove .venv e caches
doctor    # Validate .agents structure
```

### Documentation

```makefile
structure # Generate project structure docs
index     # Update SPECS/ADRS indexes
sync      # Sync AGENTS.md to agent files
```

### Workflows

```makefile
new       # Create workstream (THEME=xxx)
quick     # Quick task in active session
verify    # Check task completion
lint      # Validate markdown docs
```

### WB Update

```makefile
wb-touch            # Update updated_at
wb-normalize-time   # Normalize timestamps
wb-files-changed    # Refresh Files Changed
wb-task             # Mark task by ID
wb-status           # Set doc status
wb-timeline         # Append timeline entry
wb-link             # Set frontmatter links
```

### Quick Workflows

```makefile
all       # Run full validation (doctor + structure + index + verify)
refresh   # Clean + setup + structure
```

---

*Makefile fornece interface conveniente para operações frequentes*
