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
├── plans/
├── lessons/
└── agentic/

.agents/
├── config.json
├── lock.json
├── manifest.json
├── rules/
├── skills/
├── tmp/
└── data/

.afol/
├── tmp/
└── data/
```

## Required Folders

| Folder | Purpose |
| --- | --- |
| `docs/templates/` | Reusable templates |
| `.afol/wb/` | Durable governed plan sessions |
| `docs/standards/` | Human standards |
| `docs/lessons/` | Lessons learned |
| `docs/agentic/` | Tool docs |
| `docs/arc/` | Goal-state docs |
| `docs/map/` | Current-state evidence |
| `.agents/config.json` | Path contract for thin scaffold and mutable state |
| `.afol/adm/rules/` | Local rules |
| `.agents/manifest.json` | Template ownership metadata |
| `.agents/lock.json` | Scaffold lock metadata |
| `.agents/skills/` | Project-local skills when configured as `paths.skills_dir` |
| `.afol/tmp/` | Provider-compatible temporary files |
| `.afol/data/` | Provider-compatible local data |

## Required Config Files

- `.agents/config.json`
- `.agents/manifest.json`
- `.agents/lock.json`
- configured `paths.wb_dir` and `paths.mutable_dir`

## Validation

```bash
./afol validate
```

## Rule

- Keep structure minimal and predictable.
- Do not add parallel folders for existing contracts.
- Read `.agents/config.json` before writing mutable state.
