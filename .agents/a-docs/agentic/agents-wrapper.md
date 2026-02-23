---
id: TOOL-011
theme: agents-wrapper
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  makefile: ./makefile.md
---

# agents (Bash Wrapper) - CLI Entry Point

## Por Que Existe

**Problema:** Scripts Python requerem:
- Virtualenv configurado
- Dependências instaladas
- Comando uv run correto
- Ambiente isolado

**Solução:** Wrapper bash que abstrai complexidade e fornece interface unificada.

## Function

Wrapper bash que:

1. **Checks uv** - Garante que está instalado
2. **Checks .venv** - Creates se não existir
3. **Executa com isolamento** - `uv run --with pyyaml`
4. **Preserva contexto** - Mantém Directory de trabalho
5. **Interface unificada** - `.agents/agents <command>`

## O Que Tocar

### Files Lidos

| Arquivo | Purpose |
|---------|-----------|
| `.agents/scripts/.venv/` | Virtualenv |
| `.agents/scripts/*.py` | Scripts Python |

### Files Executados

| Script | Comando |
|--------|---------|
| `agents-doctor.py` | `.agents/agents doctor` |
| `agents-new.py` | `.agents/agents new <theme>` |
| `agents-tools.py` | `.agents/agents tools ...` |
| `agents-wb-update.py` | `.agents/agents wb-update ...` |
| ... | ... |

## How to Configure

### Comandos Disponíveis

```bash
doctor              # Validation de estrutura
new <theme>         # Criar workstream
index               # Atualizar índices
lint-docs           # Lint de markdown
structure-map       # Mapear estrutura
sync                # Sincronizar agent docs
verify-tasks        # Verificar tasks
wb-update           # Automation WB
tools               # Descoberta de tools
help                # Ajuda
```

### Aliases

```bash
lint-docs → lint
structure-map → map
verify-tasks → verify
wb-update → wb
```

## How to Modify

### Adicionar Novo Comando

Editar `agents`:

```bash
case "${COMMAND}" in
    new-command)
        cd "${ORIGINAL_PWD}"
        uv run --with "pyyaml" "${SCRIPTS_DIR}/agents-new-command.py" "$@"
        ;;
```

### Adicionar Help

Editar seção `help`:

```bash
echo "  new-command         Descrição do comando"
```

## How to Test

```bash
# Help geral
./.agents/agents help

# Executar comando
./.agents/agents doctor

# Verificar uv
which uv

# Verificar .venv
ls -la .agents/scripts/.venv/
```

## main Funções

```bash
# Estrutura do wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="${SCRIPT_DIR}/scripts"
ORIGINAL_PWD="$(pwd)"

# Check uv
if ! command -v uv &> /dev/null; then
    echo "❌ uv not found"
    exit 1
fi

# Check .venv
if [ ! -d "${SCRIPTS_DIR}/.venv" ]; then
    echo "⚠️  Virtualenv not found. Setting up..."
    cd "${SCRIPTS_DIR}"
    uv sync
fi

# Executar
case "${COMMAND}" in
    ...)
        uv run --with "pyyaml" "${SCRIPTS_DIR}/agents-*.py" "$@"
        ;;
esac
```

---

*agents wrapper é a interface primária para todas as tools*
