---
doc_type: standard
status: active
created_at: "2026-04-04T16:00:00Z"
updated_at: "2026-04-04T16:00:00Z"
---

# Legacy Z-ARQ Retention Policy

## Purpose

Define how legacy archived sessions in `.agents/z-arq/` are retained, cleaned, and referenced while the factory completes the AFOL-only migration. New AFOL provider-compatible migration archives belong under `.afol/data/migrations/`.

## Policy

| Rule | Value | Rationale |
|------|-------|-----------|
| **Legacy archive destination** | `.agents/z-arq/` | Factory-only compatibility archive surface |
| **AFOL migration archive destination** | `.afol/data/migrations/` | Provider-compatible mutable-state migration archive |
| **What gets archived** | Finalized legacy sessions (status: `final`, `draft`, `deprecated`) only | Active sessions must stay in `.afol/wb/` |
| **Archive trigger** | When `.afol/wb/` has more than 3 finalized sessions | Keeps active surface low-noise for agents |
| **Retention period** | 180 days from archive date | Balances reference value with storage |
| **Cleanup action** | Delete sessions older than 180 days after manual review | Prevents indefinite growth |
| **Index maintenance** | Update `docs/knowledge/INDEX.md` after archiving | Keeps knowledge index accurate |

## Archive Process

```bash
# Archive a finalized legacy session
mv .afol/wb/<session-id> .agents/z-arq/<session-id>

# AFOL provider-compatible cleanup archives mutable legacy state here
find .afol/data/migrations -maxdepth 2 -type d

# Rebuild knowledge index after archiving
afol validate --changed-path docs/knowledge/INDEX.md
# If this validation lacks parity, record factory-only migration debt instead of
# documenting Python script fallbacks as downstream usage.
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
