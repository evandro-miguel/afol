---
doc_type: standard
status: active
created_at: "2026-04-04T16:00:00Z"
updated_at: "2026-04-04T16:00:00Z"
---

# Z-ARQ Retention Policy

## Purpose

Define how archived workbench sessions in `.agents/z-arq/` are retained, cleaned, and referenced to prevent indefinite growth while preserving useful historical context.

## Policy

| Rule | Value | Rationale |
|------|-------|-----------|
| **Archive destination** | `.agents/z-arq/` | Single canonical archive surface |
| **What gets archived** | Finalized sessions (status: `final`, `draft`, `deprecated`) only | Active sessions must stay in `.afol/wb/` |
| **Archive trigger** | When `.afol/wb/` has more than 3 finalized sessions | Keeps active surface low-noise for agents |
| **Retention period** | 180 days from archive date | Balances reference value with storage |
| **Cleanup action** | Delete sessions older than 180 days after manual review | Prevents indefinite growth |
| **Index maintenance** | Update `docs/knowledge/INDEX.md` after archiving | Keeps knowledge index accurate |

## Archive Process

```bash
# Archive a finalized session
mv .afol/wb/<session-id> .agents/z-arq/<session-id>

# Rebuild knowledge index after archiving
.agents/scripts/.venv/bin/python .agents/scripts/agents-knowledge.py index
```

## What to Preserve

Before deleting old archived sessions, check for:
- **Lessons learned** — extract to `docs/lessons/entries/` if valuable
- **Reusable patterns** — extract to `docs/patterns/` if applicable
- **Decision records** — extract to `docs/arc/DECISIONS/` if significant
- **Spec references** — ensure specs exist independently of sessions

## Naming Convention

Archived sessions keep their original folder name:
```
.agents/z-arq/
├── 260223_1825_tools-structure-hardening/
├── 260306_2128_context-driven-execution-commands/
└── README.md
```

## Manual Cleanup

```bash
# List sessions older than 180 days
find .agents/z-arq/ -maxdepth 1 -type d -mtime +180 -name "26*"

# Review before deletion
ls -la .agents/z-arq/260223_*/

# Delete after review
rm -rf .agents/z-arq/260223_1825_tools-structure-hardening/
```

---
*Template: `docs/templates/standard.md`*
