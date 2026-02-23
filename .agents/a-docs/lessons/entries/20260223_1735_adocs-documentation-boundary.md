---
doc_type: lesson_entry
id: 20260223_1735_adocs-documentation-boundary
status: active
created_at: '2026-02-23T17:35:00-03:00'
updated_at: '2026-02-23T18:25:49-03:00'
tags:
- docs
- boundaries
- governance
---

# 2026-02-23 - `.agents/a-docs` must remain documentation-only

## Context

User correction requested an explicit rule: `.agents/a-docs` is only for documentation.

## Lesson

Documentation boundaries must be explicit to avoid operational state leaking into docs folders.

## Prevention Rule

Never store runtime state, cache, mirrors, generated artifacts, or operational data under `.agents/a-docs/`.

## Guardrail

Keep runtime/state in dedicated operational paths (for example `.agents/cache/`, `.agents/wb/`) and enforce this rule in `AGENTS.md`.
