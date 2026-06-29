---
doc_type: lesson_entry
id: lesson_20260626_1042_downstream-afol-command-must-stay-external
status: active
created_at: '2026-06-26T10:42:11-03:00'
updated_at: '2026-06-26T10:42:11-03:00'
source: user_correction
related_session: 260626_1042_downstream-afol-command-contract
---

# Lesson: Downstream AFOL Command Must Stay External

## Correction

The user clarified that `afol` must be an external command controlling project
operations. Downstream projects must not receive a local `afol` executable or
wrapper from the scaffold.

## What Went Wrong

- The template instructions said to use `afol` as the downstream front door.
- The exported scaffold still included a root `afol` shell wrapper.
- Bootstrap documentation still used wrapper-oriented language, which made the
  command boundary ambiguous.

## Prevention Rule

Treat root command wrappers such as `afol`, `a`, `Justfile`, and legacy
runtime adapters as forbidden downstream scaffold payload.

The source repository may keep its root `afol` development/package entrypoint,
but `src/project-template/` must contain only project config, provider
metadata, governance docs, and AFOL state/docs.
