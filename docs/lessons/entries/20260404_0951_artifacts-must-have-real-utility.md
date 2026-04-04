---
doc_type: lesson
id: 20260404_0951_artifacts-must-have-real-utility
status: active
created_at: '2026-04-04T09:51:00-03:00'
updated_at: '2026-04-04T10:08:12-03:00'
---

# Lesson: Artifacts Must Have Real Utility

## Context

The workflow was still biased toward materializing a broad package of workbench
artifacts from templates, even when the actual request only needed research,
planning, or a small delivery slice.

## What Went Wrong

- Presence of an artifact was treated as progress.
- `status != draft` was used as a weak proxy for readiness.
- Empty or placeholder-only `log`, `report`, `brainstorm`, and similar docs
  could exist without proving why they belonged in the session.
- Agents could create plans for research-only work or create brainstorming docs
  even when no brainstorming actually happened.

## Prevention Rule

- A workbench artifact may exist only if it has a concrete reason to exist in
  the current session.
- Default creation must be intent-based, not package-based.
- Placeholder-only artifacts do not count as valid progress, even with
  `active` or `final` status.
- If the work is research-only, do not create `plan` or `task` unless execution
  work is actually being staged.
- If brainstorming did not happen, do not materialize `brainstorm`.

## Guardrails Added

- Introduced `workflow.artifact_policy` for intent-based artifact creation.
- Tightened readiness so invalid placeholder-only artifacts no longer count as
  `ready` or `done`.
- Added strict verification checks for artifact utility and closure artifacts.
- Added tests for research-only creation, lazy log materialization, and strict
  validation of placeholder-only artifacts.
