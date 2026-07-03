---
doc_type: rule
id: RULE-005
theme: folder-structure
version: 2.1
created: 2026-02-23
updated_at: "2026-06-20T00:00:00Z"
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Folder Structure

**Purpose:** protect the AFOL-only scaffold layout.

## Ownership

| Path                    | Owner                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `.afol/adm/`            | Static governance: roadmap, specs, hooks, rules, seeds, tools |
| `.afol/pstr/`           | Current project-structure maps only                           |
| `.afol/wb/`             | Governed sessions, evidence, indexes, benchmark state         |
| `.afol/`                | Mutable AFOL runtime state                                    |
| `.afol/config.json`     | Canonical AFOL config (`.agents/config.json` is legacy fallback only) |
| `.agents/lock.json`     | Provider-facing lock metadata                                 |
| `.agents/manifest.json` | Provider-facing manifest metadata                             |
| `.agents/skills/`       | Project-local provider skills                                 |
| `src/project-template/` | Exportable downstream scaffold                                |
| `docs/map/`             | Current-state evidence only                                   |

## Rules

- Use `.afol/wb/` for governed sessions.
- Use `.afol/adm/` for durable project direction and static AFOL catalogs.
- Do not put mutable sessions or runtime state under `.agents/`.
- Do not create `.afol/skills/`; skills live in configured provider skill root.
- Do not restore retired `.agents` command wrappers, Python runners, runtime,
  workbench, archive, YAML fallback, or legacy routing.
- Keep generated/template changes inside their owned surfaces.

## Validate

```bash
afol local-state rebuild
afol validate project
```

## References

- `AGENTS.md`
- `src/project-template/`
- RULE-006 - Applicable Rule Resolution
