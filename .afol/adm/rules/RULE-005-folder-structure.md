---
doc_type: rule
id: RULE-005
theme: folder-structure
version: 2.0
created: 2026-02-23
updated_at: '2026-06-16T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Folder Structure

**Purpose:** define the AFOL-only scaffold layout.

---

## Required Structure

```text
docs/
├── map/                    # Current-state repository mapping
└── ...                     # Project docs owned outside runtime state

.afol/
├── adm/                    # Roadmap, specs, hooks, rules, seeds, desired state
├── pstr/                   # Current project-structure maps only
└── wb/                     # Governed execution sessions, evidence, indexes

.agents/
├── config.json             # Static scaffold metadata
├── lock.json               # Static scaffold metadata
├── manifest.json           # Static scaffold metadata
└── skills/                 # Project-local provider skills

src/
└── project-template/       # Exportable downstream scaffold
```

---

## Ownership

| Path | Purpose |
|------|---------|
| `.afol/adm/` | Project direction, specs, decisions, strategy |
| `.afol/adm/hooks/` | Static provider-neutral hook catalog |
| `.afol/adm/rules/` | Static rules for agents |
| `.afol/adm/source/` | Static source seed metadata |
| `.afol/adm/tools.json` | Static AFOL command catalog |
| `.afol/pstr/` | Current project-structure maps only |
| `.afol/wb/` | Mutable sessions, events, evidence, indexes, benchmarks |
| `.agents/config.json` | Static scaffold config metadata |
| `.agents/lock.json` | Static scaffold lock metadata |
| `.agents/manifest.json` | Static scaffold manifest metadata |
| `.agents/skills/` | Project-local provider skills |
| `src/project-template/` | Exportable template baseline |

Mutable runtime state belongs under `.afol/`.

---

## Validate

```bash
afol status
afol local-state rebuild --json
afol validate project --json
afol verify-tasks --strict
python -m json.tool .afol/adm/tools.json
```

---

## Best Practices

**DO:**

- Use `.afol/wb/` for governed sessions.
- Use `.afol/adm/` for durable project direction.
- Use `.afol/pstr/` only for current-state structure maps.
- Keep `.agents/` limited to retained static metadata and project-local skills.
- Validate scaffold metadata after edits.

**DON'T:**

- Recreate discontinued command wrappers, Python runners, or compatibility adapters.
- Put mutable session state under `.agents/`.
- Store hooks, rules, seeds, roadmap, specs, execution automation, or benchmark
  results under `.agents/`.
- Leave static metadata pointing agents to retired entrypoints.

---

## References

- `AGENTS.md`
- `src/project-template/`
- RULE-006 - Applicable Rule Resolution
