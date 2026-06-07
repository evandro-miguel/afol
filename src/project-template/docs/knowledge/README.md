---
doc_type: index
id: knowledge_readme
status: active
created_at: '2026-03-06T23:05:00+00:00'
updated_at: '2026-03-06T20:23:50-03:00'
---

# Knowledge Layer

This folder stores reusable project knowledge after the project starts.

## Purpose

- Help agents reuse earlier research instead of repeating exploration.
- Keep the knowledge index small and searchable.

## Source Artifacts

Read the governed plan root from `.agents/config.json` `paths.wb_dir` before
collecting source artifacts. The default is `docs/plans`.

- `<configured-plan-dir>/**/_research_*.md`
- `<configured-plan-dir>/**/_brainstorm_*.md`
- `<configured-plan-dir>/**/_explorer-check_*.md`
- `<configured-plan-dir>/**/_report_*.md`
- `<configured-plan-dir>/**/_postmortem_*.md`

## Files

- `INDEX.md` is generated from knowledge-bearing governed plan artifacts.

---

*Document: `docs/knowledge/README.md`*
