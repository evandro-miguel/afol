---
doc_type: lesson
id: 20260404_1528_workbench-artifacts-must-stay-scaffold-executable
status: active
created_at: '2026-04-04T15:28:00-03:00'
updated_at: '2026-04-04T11:16:40-03:00'
---

# Lesson: Workbench Artifacts Must Stay Scaffold-Executable

## Context

A scaffold quality review session produced `plan` and `task` artifacts that did
not follow the scaffold's own executable contract. The task board used a custom
table shape and checkbox-like states that the execution helpers do not parse
reliably, and the metadata used freeform intent text instead of a canonical
intent.

## What Went Wrong

- The session artifact was treated as "good enough" because it looked readable,
  even though it was not scaffold-executable.
- The task board schema drifted away from the parser contract.
- Metadata drifted away from the canonical intent vocabulary.
- The plan then started optimizing work on top of a broken control surface.

## Prevention Rule

- A governed `plan` or `task` artifact must use the scaffold's canonical
  metadata and task-board structure.
- Human-readable is not enough; workbench artifacts must also be parseable by
  status, review, and verification commands.
- If a review session exposes a malformed workbench artifact, that failure is
  part of the quality problem and must be added to the plan scope immediately.
- Do not continue execution on top of a malformed task board; normalize it
  first.

## Guardrails Added

- Reworked the affected plan/task workstream artifacts into canonical
  scaffold-executable form.
- Narrowed the quality-review plan so it no longer mixes contract-breaking
  migrations with small reproducible fixes.
- Added this lesson so future review sessions treat malformed workbench
  artifacts as first-class defects.
