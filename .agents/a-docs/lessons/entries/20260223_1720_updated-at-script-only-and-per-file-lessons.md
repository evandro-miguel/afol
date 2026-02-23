---
doc_type: lesson_entry
id: 20260223_1720_updated-at-script-only-and-per-file-lessons
status: active
created_at: '2026-02-23T17:20:00-03:00'
updated_at: '2026-02-23T17:53:10-03:00'
tags:
- process
- lessons
- timestamp
- guardrail
---

# 2026-02-23 - Script-Only updated_at and One-File-Per-Lesson

## Context

User correction: avoid manual edits to `updated_at` and move lessons to one file per lesson for easier management.

## Lesson

Metadata updates are operational and should be automated; lessons scale better when each lesson has its own file.

## Prevention Rule

- Never edit `updated_at` manually in managed docs.
- Always use automation scripts/commands to update `updated_at`.
- Add new lessons as individual files under `.agents/a-docs/lessons/entries/`.

## Guardrails

- Mandatory policy documented in root `AGENTS.md`.
- Lessons structure documented in `.agents/a-docs/lessons/README.md`.
- References in templates point to the lesson entries folder.
