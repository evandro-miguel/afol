---
id: RULE-005
theme: folder-structure
version: 1.0
created: 2026-02-23
applies_to: All agents (QWEN, CLAUDE, GEMINI)
---

# Folder Structure

**Purpose:** Define required .agents folder structure and configuration.

---

## Required Structure

```text
docs/
├── arc/                    # Goal-state canon and architecture docs
├── map/                    # Current-state repository mapping
├── standards/              # Human-readable standards
├── templates/              # Document templates
├── lessons/                # Lessons learned
└── agentic/                # Tool documentation

.agents/
├── agents.config           # Central configuration (YAML)
├── tools.json              # Tool catalog (JSON)
├── agents                  # CLI wrapper (bash)
├── wb/                     # Workstreams (sessions)
│   ├── .active_session     # Pointer to current session
│   └── YYMMDD_HHMM_<theme>/
├── scripts/
│   ├── agents-*.py         # Tool scripts
│   └── lib/
│       └── agents_config.py
└── rules/                  # Agent rules
```

---

## Required Folders

| Folder | Purpose |
|--------|---------|
| `docs/templates/` | Document templates |
| `docs/standards/` | Human standards |
| `docs/lessons/` | Lessons learned |
| `docs/agentic/` | Tool documentation |
| `docs/arc/` | Architecture docs |
| `docs/arc/SPECS/` | Technical specifications |
| `docs/arc/DECISIONS/` | Architecture decisions |
| `docs/map/` | Current-state repository mapping |
| `wb/` | Workstreams |
| `rules/` | Agent rules |
| `scripts/` | Tool scripts |
| `skills/` | Agent skills |
| `z-arq/` | Architecture notes |

**Validate:**

```bash
make doctor
```

---

## Configuration Files

### agents.config (YAML)

```yaml
version: 1

paths:
  agents_dir: .agents
  docs_dir: docs
  wb_dir: .agents/wb
  templates_dir: docs/templates
  arc_dir: docs/arc

time:
  default_offset: "+00:00"
  wb_offset: "-03:00"

lint:
  excluded_path_prefixes:
    - docs/map/extra/
    - docs/map/structure/

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

**Location:** `.agents/agents.config`

---

### tools.json (JSON)

```json
{
  "version": "1.0.0",
  "tools": [...],
  "tool_categories": {...},
  "execution_modes": {...},
  "makefile_aliases": {
    "st": "structure",
    "ix": "index",
    "sy": "sync",
    "vf": "verify",
    "dr": "doctor"
  }
}
```

**Location:** `.agents/tools.json`

**Validate:**

```bash
python -m json.tool .agents/tools.json
```

---

### .active_session

```text
.agents/wb/260223_1800_auth-refactor/
```

**Purpose:** Points to current workstream

**Location:** `.agents/wb/.active_session`

**Update automatically:**

```bash
./.agents/agents new <theme>
```

---

## Documentation Locations

| Type | Location |
|------|----------|
| Tool documentation | `docs/agentic/` |
| Human standards | `docs/standards/` |
| Templates | `docs/templates/` |
| Lessons learned | `docs/lessons/` |
| Architecture | `docs/arc/` |
| Structure docs | `docs/map/structure/` |
| Specifications | `docs/arc/SPECS/` |
| Decisions (ADRs) | `docs/arc/DECISIONS/` |
| Agent rules | `.agents/rules/` |

---

## Workstream Structure

```text
.agents/wb/
└── 260223_1800_auth-refactor/
    ├── 260223_1800_auth-refactor_plan_01.md
    ├── 260223_1800_auth-refactor_task_01.md
    ├── 260223_1800_auth-refactor_log_01.md
    └── 260223_1800_auth-refactor_spec-lite_01.md
```

**Create with:**

```bash
./.agents/agents new auth-refactor --spec-lite
```

---

## Best Practices

**DO:**

- ✅ Use `.agents/` as root for all agent files
- ✅ Keep configuration in `.agents/agents.config`
- ✅ Store tool docs in `docs/agentic/`
- ✅ Store human docs in `docs/standards/`
- ✅ Validate structure with `make doctor`

**DON'T:**

- ❌ Create folders outside `.agents/` for agent work
- ❌ Edit `agents.config` without validating YAML
- ❌ Edit `tools.json` without validating JSON
- ❌ Delete required folders

---

## Troubleshooting

```bash
# Check structure
make doctor

# Check config
python -c "import yaml; yaml.safe_load(open('.agents/agents.config'))"

# Check tools.json
python -m json.tool .agents/tools.json

# List workstreams
ls -la .agents/wb/

# Check active session
cat .agents/wb/.active_session
```

---

## References

- `.agents/agents.config` - Scaffold configuration
- `.agents/tools.json` - Tool catalog
- RULE-001 - Tool Discovery & Usage

---

*Version: 1.0 | Lines: ~160 | Max: 250*
