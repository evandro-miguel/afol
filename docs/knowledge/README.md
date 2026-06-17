---
doc_type: index
id: knowledge_readme
status: active
created_at: '2026-03-06T23:05:00+00:00'
updated_at: '2026-06-09T21:10:00-03:00'
---

# Knowledge Layer

This folder supports low-token discovery of prior AFOL workbench knowledge.

## Source Artifacts

- `.afol/wb/**/_research_*.md`
- `.afol/wb/**/_brainstorm_*.md`
- `.afol/wb/**/_explorer-check_*.md`
- `.afol/wb/**/_report_*.md`
- `.afol/wb/**/_postmortem_*.md`

## Current Lookup

```bash
rg -n "<topic>" docs/knowledge .afol/wb
rg -n "_research_|_report_|_postmortem_" .afol/wb
```

Use `docs/knowledge/INDEX.md` as the curated low-token index when it exists.
AFOL-owned library and memory surfaces live under `.afol/library/**` and
`.afol/memory/**`.

Do not use or restore the retired `.agents/agents` command system.
