---
id: TOOL-014
theme: agents-bootstrap
type: tool-doc
status: active
owner: system
created_at: 2026-02-23T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  wrapper: ./agents-wrapper.md
---

# agents-bootstrap.py - Bootstrap em Outros Repositórios

## Por Que Existe

**Problema:** Configurar o sistema `.agents` manualmente em outro repositório requer:
- Copiar múltiplos Files e Folders
- Criar estrutura de diretórios obrigatória
- Configurar Makefile wrapper
- Detectar stack do projeto alvo
- Validar instalação

**Solução:** Bootstrap automático que instala `.agents` em qualquer repositório com um comando.

## Function

Instala o sistema `.agents` em outro repositório:

1. **Detecta stack** - Node.js, Python, Go, etc.
2. **Copia Files** - Scripts, configs, templates
3. **Creates Folders** - Estrutura obrigatória
4. **Configura Makefile** - Wrapper no repo alvo
5. **Validates** - Roda doctor e Checks tools

## O Que Tocar

### Files Lidos (Origem)

| Arquivo | Purpose |
|---------|-----------|
| `.agents/agents` | CLI wrapper |
| `.agents/agents.config` | Configuration |
| `.agents/tools.json` | Catalog de tools |
| `.agents/scripts/` | Scripts Python |
| `.agents/a-docs/` | Documentation |
| `.agents/rules/` | Regras de agentes |

### Files Escritos (Destino)

| Local | Ação |
|-------|------|
| `<target>/AGENTS.md` | Copiado |
| `<target>/.agents/` | Estrutura completa |
| `<target>/Makefile` | Wrapper configurado |
| `<target>/.agents/arc/` | Folders criadas |
| `<target>/.agents/wb/` | Folders criadas |

## How to Configure

### Uso Básico

```bash
# Bootstrap em outro repositório
./.agents/agents bootstrap /path/to/target-repo

# Dry run (apenas mostra o que será feito)
./.agents/agents bootstrap /path/to/target --dry-run

# Forçar sobrescrita
./.agents/agents bootstrap /path/to/target --force

# Pular Validation pós-bootstrap
./.agents/agents bootstrap /path/to/target --skip-checks
```

### Opções

| Opção | Descrição |
|-------|-----------|
| `--force` | Sobrescreve Files existentes |
| `--dry-run` | Mostra ações sem executar |
| `--skip-checks` | Pula doctor/tools-check |

## How to Modify

### Adicionar Novo Arquivo para Copiar

Editar `FILES_TO_COPY` em `agents-bootstrap.py`:

```python
FILES_TO_COPY = [
    Path("AGENTS.md"),
    Path(".agents/agents"),
    Path(".agents/agents.config"),
    Path(".agents/tools.json"),
    # Adicionar novo:
    Path(".agents/novo-arquivo"),
]
```

### Adicionar Nova Pasta para Copiar

Editar `DIRS_TO_COPY`:

```python
DIRS_TO_COPY = [
    Path(".agents/scripts"),
    Path(".agents/a-docs"),
    Path(".agents/rules"),
    # Adicionar nova:
    Path(".agents/nova-pasta"),
]
```

### Adicionar Pasta Obrigatória

Editar `ENSURE_DIRS`:

```python
ENSURE_DIRS = [
    Path(".agents/arc"),
    Path(".agents/arc/SPECS"),
    Path(".agents/arc/DECISIONS"),
    Path(".agents/wb"),
    Path(".agents/skills"),
    Path(".agents/z-arq"),
    # Adicionar nova:
    Path(".agents/nova-pasta"),
]
```

## How to Test

### Teste Local (Dry Run)

```bash
# Ver o que será feito
./.agents/agents bootstrap /tmp/test-repo --dry-run

# Esperado: Lista de ações sem executar
```

### Teste Real

```bash
# Criar repo teste
mkdir /tmp/test-agents
cd /tmp/test-agents
git init

# Bootstrap
./.agents/agents bootstrap /tmp/test-agents

# Verificar estrutura
ls -la /tmp/test-agents/.agents/
ls -la /tmp/test-agents/.agents/scripts/

# Validar
cd /tmp/test-agents
./.agents/agents doctor
./.agents/agents tools list
```

### Validation Pós-Bootstrap

```bash
# O bootstrap roda automaticamente:
# 1. .agents/agents doctor
# 2. .agents/agents tools list

# Se falhar:
cd <target-repo>
./.agents/agents doctor
```

## main Funções

```python
# Estrutura do script
parse_args()              # Parse argumentos
detect_stack()            # Detecta stack do projeto
copy_files()              # Copia Files
copy_directories()        # Copia Folders
ensure_structure()        # Creates Folders obrigatórias
setup_makefile()          # Configura Makefile wrapper
run_doctor()              # Validates instalação
run_tools_check()         # Checks tools
```

### detect_stack

```python
def detect_stack(target: Path) -> Dict[str, List[str]]:
    """Detecta stack do projeto alvo."""
    stack = {"signals": [], "commands": []}
    
    # Node.js
    if (target / "package.json").exists():
        stack["signals"].append("Node.js")
        # Detecta npm scripts
    
    # Python
    if (target / "pyproject.toml").exists():
        stack["signals"].append("Python")
    
    # Go
    if (target / "go.mod").exists():
        stack["signals"].append("Go")
    
    return stack
```

### copy_files

```python
def copy_files(source: Path, target: Path, force: bool):
    """Copia Files da origem para destino."""
    for file_path in FILES_TO_COPY:
        src = source / file_path
        dst = target / file_path
        
        if dst.exists() and not force:
            print(f"⚠️  {file_path} exists, skip")
            continue
        
        shutil.copy2(src, dst)
        print(f"✓ {file_path}")
```

### ensure_structure

```python
def ensure_structure(target: Path):
    """Creates Folders obrigatórias."""
    for dir_path in ENSURE_DIRS:
        full_path = target / dir_path
        full_path.mkdir(parents=True, exist_ok=True)
        print(f"✓ Created {dir_path}")
```

## Flow de Bootstrap

```
1. Parse argumentos (--force, --dry-run, --skip-checks)
   ↓
2. Detectar stack do projeto alvo
   ↓
3. Copiar Files (AGENTS.md, agents, agents.config, tools.json)
   ↓
4. Copiar Folders (scripts, a-docs, rules)
   ↓
5. Criar estrutura obrigatória (arc, wb, skills, z-arq)
   ↓
6. Configurar Makefile wrapper
   ↓
7. Validar (doctor + tools list)
   ↓
8. Reportar resultado
```

## Troubleshooting

### Files Já Existem

```bash
# Usar --force para sobrescrever
./.agents/agents bootstrap /path/to/repo --force
```

### Validation failure

```bash
# Rodar manualmente no target
cd /path/to/repo
./.agents/agents doctor
./.agents/agents tools list

# Se tools falhar:
python -m json.tool .agents/tools.json
```

### Makefile Conflito

Se Makefile já existe no target:

```bash
# Backup do Makefile original
mv Makefile Makefile.bak

# Re-rodar bootstrap
./.agents/agents bootstrap /path/to/repo
```

## Referências

- `.agents/a-docs/agentic/agents-wrapper.md` - CLI wrapper
- `.agents/a-docs/agentic/tools-json.md` - tools.json
- `.agents/a-docs/agentic/makefile.md` - Makefile targets

---

*agents-bootstrap.py instala o sistema .agents em qualquer repositório*
