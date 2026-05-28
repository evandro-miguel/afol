---
doc_type: rule
id: RULE-005
theme: folder-structure
version: 1.0
created: 2026-02-23
applies_to: All agents (QWEN, CLAUDE, GEMINI)
updated_at: '2026-05-14T20:05:00-03:00'
---

# Folder Structure

**Purpose:** Keep required scaffold layout stable.

## Required Structure

```text
docs/
├── arc/
├── map/
├── standards/
├── templates/
├── lessons/
└── agentic/

.agents/
├── agents.config
├── tools.json
├── agents
├── wb/
├── scripts/
└── rules/
```

## Required Folders

| Folder | Purpose |
| --- | --- |
| `docs/templates/` | Reusable templates |
| `docs/standards/` | Human standards |
| `docs/lessons/` | Lessons learned |
| `docs/agentic/` | Tool docs |
| `docs/arc/` | Goal-state docs |
| `docs/map/` | Current-state evidence |
| `.agents/wb/` | Workbench sessions |
| `.agents/rules/` | Local rules |
| `.agents/scripts/` | CLI scripts |
| `.agents/skills/` | Project-local skills |

## Required Config Files

- `.agents/agents.config`
- `.agents/tools.json`
- `.agents/wb/.active_session`

## Validation

```bash
just doctor
python -m json.tool .agents/tools.json
python -c "import yaml; yaml.safe_load(open('.agents/agents.config'))"
```

## Rule

- Keep structure minimal and predictable.
- Do not add parallel folders for existing contracts.
