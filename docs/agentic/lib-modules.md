---
doc_type: reference
id: "lib-modules"
status: active
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
---

# Lib Modules - Internal Library

Internal Python modules used by `.agents` scripts.

## modules

### agents_config.py

Configuration loader for `.agents` system.

**Purpose:** Centralized configuration management.

**Functions:**

- `load_agents_config(script_path)` - Load and parse `agents.config`
- `get_cfg_path(root, config, key)` - Resolve config path to absolute
- `parse_offset(offset_str)` - Parse ISO timezone offset

**Usage:**

```python
from lib.agents_config import load_agents_config, get_cfg_path, parse_offset

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
TEMPLATES_DIR = get_cfg_path(ROOT_DIR, CONFIG, "templates_dir")
WB_OFFSET = CONFIG.get("time", {}).get("wb_offset", "-03:00")
WB_TZ = parse_offset(WB_OFFSET)
```

**Configuration:**
Reads from `.agents/agents.config`:

```yaml
paths:
  agents_dir: .agents
  wb_dir: docs/plans
  active_session_file: .agents/data/session/.active_session
  templates_dir: docs/templates

time:
  default_offset: "+00:00"
  wb_offset: "-03:00"
```

## Module Structure

```text
.agents/scripts/lib/
├── __init__.py          # Package init
└── agents_config.py     # Configuration loader
```

## Adding New Modules

1. Create module in `.agents/scripts/lib/`
2. Add to `__init__.py` exports
3. Update this documentation
4. Update `agents.config` if needed

## Related

- `.agents/agents.config` - Configuration file
- `agents-wrapper.md` - CLI wrapper

---

*Document: `docs/agentic/lib-modules.md`*
