---
id: TOOL-013
theme: agents-config
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  config_file: ../agents.config
---

# agents_config.py - Config Loader

## Por Que Existe

**Problema:** Múltiplos scripts Python precisam:

- Ler configuração centralizada
- Resolver caminhos relativos
- Parsear timestamps e timezones
- Ter valores default seguros

**Solução:** Módulo de configuração centralizado que todos os scripts importam.

## Função

Fornece:

1. **Carregamento de YAML** - Lê `agents.config`
2. **Deep merge** - Override de defaults
3. **Path resolution** - Caminhos absolutos
4. **Timezone parsing** - Offset para datetime
5. **Helpers de tempo** - Timestamps no formato correto

## O Que Tocar

### Arquivos Lidos

| Arquivo | Propósito |
|---------|-----------|
| `.agents/agents.config` | Configuração YAML |

### Arquivos Escritos

| Arquivo | Propósito |
|---------|-----------|
| Nenhum | Apenas leitura |

### Importado Por

| Script | Uso |
|--------|-----|
| `agents-doctor.py` | `load_agents_config()` |
| `agents-new.py` | `get_cfg_path()`, `parse_offset()` |
| `agents-tools.py` | `load_agents_config()` |
| `agents-wb-update.py` | `load_agents_config()`, `parse_offset()` |
| ... | ... |

## Como Configurar

### agents.config

```yaml
version: 1

paths:
  agents_dir: .agents
  wb_dir: .agents/wb
  active_session_file: .agents/wb/.active_session
  templates_dir: .agents/a-docs/templates
  arc_dir: .agents/arc
  specs_dir: .agents/arc/SPECS
  decisions_dir: .agents/arc/DECISIONS

time:
  default_offset: "+00:00"
  wb_offset: "-03:00"

lint:
  excluded_path_prefixes:
    - a-docs/
    - arc/structure/

doctor:
  required_folders: [...]
  required_templates: [...]

sync:
  source_file: AGENTS.md
  target_files:
    - QWEN.md
    - CLAUDE.md
    - GEMINI.md
```

## Como Modificar

### Adicionar Nova Seção de Config

1. Adicionar em `agents.config`:

```yaml
nova_secao:
  opcao1: valor1
  opcao2: valor2
```

2. Adicionar defaults em `agents_config.py`:

```python
DEFAULT_CONFIG = {
    "nova_secao": {
        "opcao1": "default1",
        "opcao2": "default2"
    }
}
```

3. Usar nos scripts:

```python
CONFIG.get("nova_secao", {}).get("opcao1")
```

### Adicionar Novo Helper

```python
def new_helper(config: Dict[str, Any]) -> str:
    """Novo helper."""
    return config.get("nova_secao", {}).get("opcao1")
```

## Como Testar

```bash
# Testar carregamento
python3 -c "
from pathlib import Path
from lib.agents_config import load_agents_config
root, config = load_agents_config(Path.cwd())
print('Root:', root)
print('WB dir:', config['paths']['wb_dir'])
print('WB offset:', config['time']['wb_offset'])
"

# Testar parse de offset
python3 -c "
from lib.agents_config import parse_offset
tz = parse_offset('-03:00')
print('Timezone:', tz)
"
```

## Principais Funções

```python
# Carregamento
find_repo_root()          # Encontra raiz do repo
load_agents_config()      # Carrega YAML
_deep_merge()             # Merge de configs

# Paths
resolve_repo_path()       # Resolve caminho relativo
get_cfg_path()            # Get path por key

# Time
parse_offset()            # Parse offset para timezone
now_iso_with_offset()     # Timestamp ISO com offset
now_compact_for_session() # Timestamp compacto
```

### find_repo_root

```python
def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / CONFIG_FILENAME).exists():
            return candidate
    return current
```

### load_agents_config

```python
def load_agents_config(repo_root: Path | None = None) -> tuple[Path, Dict[str, Any]]:
    root = find_repo_root(repo_root)
    config = DEFAULT_CONFIG
    cfg_path = root / CONFIG_FILENAME

    if cfg_path.exists():
        loaded = yaml.safe_load(cfg_path.read_text()) or {}
        config = _deep_merge(DEFAULT_CONFIG, loaded)

    return root, config
```

### parse_offset

```python
def parse_offset(offset: str) -> timezone:
    value = offset.strip()
    if value == "Z":
        return timezone.utc
    # Parse +HH:MM or -HH:MM
    hours = int(value[1:3])
    minutes = int(value[4:6])
    delta = timedelta(hours=hours, minutes=minutes)
    if value[0] == "-":
        delta = -delta
    return timezone(delta)
```

---

*agents_config.py é o coração da configuração do sistema*
