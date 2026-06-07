---
doc_type: lesson_entry
id: lesson_20260607_1039_afol_only_entrypoints
status: active
created_at: '2026-06-07T10:39:24-03:00'
updated_at: '2026-06-07T10:39:24-03:00'
source: user_correction
tags:
  - afol
  - cli-parity
  - legacy-retirement
---

# Lesson: Keep AFOL As The Only Public Entrypoint

## Correction

The user corrected a health check that treated legacy local aliases and legacy
command-runner targets as normal project entrypoints. Current direction is
AFOL-only.

## Prevention Rule

- Use `afol` as the public/factory workflow entrypoint.
- Treat legacy local aliases, `.agents/agents`, and legacy just command-runner
  surfaces as migration debt unless the task explicitly targets legacy
  compatibility retirement.
- When assessing project health, prefer `afol` plus Bun/package validation
  commands over legacy just command-runner gates.

## Guardrail

Search docs, templates, tests, and release/export scripts for legacy aliases,
`.agents/agents`, and legacy just command-runner references before claiming the
migration is complete.
