---
id: TOOL-013
theme: agents-config
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-04-04T10:08:10-03:00'
links:
  tools_json: ./tools-json.md
  config_file: ../agents.config
---

# agents_config.py - Config Loader

## Why It Exists

**Problem:** Multiple Python scripts need to:
- Read central configuration
- Resolve relative paths
- Parse timestamps and timezones
- Have safe default values

**Solution:** Centralized configuration module that all scripts import.

## Function

Provides:

1. **YAML loading** - Reads `agents.config`
2. **Deep merge** - Override defaults
3. **Path resolution** - Absolute paths
4. **Timezone parsing** - Offset to datetime
5. **Time helpers** - Correct timestamp format
6. **Provider defaults** - Stable defaults for optional integrations such as external memory
7. **Workflow manifest defaults** - Shared artifact catalog for workstream docs
8. **Workflow policy defaults** - Shared intent-based creation/context rules
9. **Lint exclusions** - Canonical skip list for temporary or imported content

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/agents.config` | Configuration YAML |

### Files Written

| File | Purpose |
|------|---------|
| None | Read-only |

### Imported By

| Script | Usage |
|--------|-------|
| `agents-doctor.py` | `load_agents_config()` |
| `agents-new.py` | `get_cfg_path()`, `parse_offset()` |
| `agents-tools.py` | `load_agents_config()` |
| `agents-wb-update.py` | `load_agents_config()`, `parse_offset()` |
| ... | ... |

## How to Configure

### agents.config

```yaml
version: 1

paths:
  agents_dir: .agents
  wb_dir: .agents/wb
  active_session_file: .agents/wb/.active_session
  templates_dir: docs/templates
  arc_dir: docs/arc
  specs_dir: docs/arc/SPECS
  decisions_dir: docs/arc/DECISIONS

time:
  default_offset: "+00:00"
  wb_offset: "-03:00"

lint:
  excluded_path_prefixes:
    - .agents/tmp/
    - .tmp/
    - tmp/
    - .agents/arc/map/extra/
    - docs/arc/structure/
    - scripts/.agent/docs/
    - z-arq/

workflow:
  artifact_manifest:
    version: 1
    artifacts:
      - doc_type: brainstorm
        template: brainstorm.md
        phase: planning
        purpose: Capture real option analysis before committing to a direction.
      - doc_type: plan
        template: plan.md
        phase: planning
        depends_on:
          - brainstorm
          - research
          - explorer-check
      - doc_type: report
        template: report.md
        phase: delivery
        id_placeholder: "<report_doc_id_or_empty>"
        depends_on:
          - task
          - log
  artifact_policy:
    default_intent: delivery
    intents:
      delivery:
        create: [task]
      research:
        create: [research]
      closure:
        create: [report]

memory:
  enabled: true
  provider: "basic_memory"
  mode: "contract"
  authority: "auxiliary"
  project: "main"
  runtime_server: "basic_memory"
```

Temporary folders are intentionally excluded from markdown lint. Anything under
`.agents/tmp/`, `.tmp/`, or a repo-local `tmp/` path is treated as disposable
workspace, not canonical documentation.

## How to Use

### In Python Scripts

```python
from lib.agents_config import load_agents_config, get_cfg_path, parse_offset

# Load config
ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)

# Get path
TEMPLATES_DIR = get_cfg_path(ROOT_DIR, CONFIG, "templates_dir")

# Parse timezone
WB_OFFSET = CONFIG.get("time", {}).get("wb_offset", "-03:00")
WB_TZ = parse_offset(WB_OFFSET)
```

## How to Modify

### Main Functions

```python
def load_agents_config(script_path: Path) -> Tuple[Path, Dict]:
    """Load agents.config and return (root_dir, config_dict)."""

def get_cfg_path(root: Path, config: Dict, key: str) -> Path:
    """Resolve config path to absolute path."""

def parse_offset(offset_str: str) -> timezone:
    """Parse ISO offset (e.g., '-03:00') to timezone."""
```

### Adding New Config Options

1. Add to `.agents/agents.config`
2. Add default in `load_agents_config()`
3. Update this document
4. If the option feeds a user-facing command, update the corresponding tool doc and standards usage docs
5. If the option changes workflow artifact behavior, keep `lib/workflow_manifest.py` aligned with the same catalog/policy contract

## How to Test

```python
# Test loading
from lib.agents_config import load_agents_config
root, config = load_agents_config(Path.cwd())
assert 'paths' in config
assert 'time' in config
```

## Related

- [tools-json.md](./tools-json.md) - Tool catalog
- [agents-memory.md](./agents-memory.md) - External memory adapter
- `.agents/agents.config` - Configuration file

---
*Document: `docs/agentic/agents-config.md`*
