---
doc_type: lesson_entry
id: lesson_20260606_2037_plan_after_local_discovery
status: active
created_at: '2026-06-06T20:37:43-03:00'
updated_at: '2026-06-06T21:05:00-03:00'
source: user_correction
related_workstream_id: 260606_2022_afol-provider-compatible-bootstrap
---

# Lesson: Plan After Local Discovery

## Correction

The user corrected an attempt to plan AFOL changes before reading the project
and requested `$code-tools` plus project analysis first.

The user later clarified that this request targets the actual reusable scaffold
implementation and downstream project template, not this repository's
organizational workbench/configuration artifacts.

## Prevention Rule

- Before writing an execution plan for scaffold behavior, inspect the relevant
  local files and repo tools first.
- Plans must include current evidence from the repository, not only inferred
  architecture or desired direction.
- When the user asks to change scaffold behavior, identify the product/template
  implementation path first. In this repo, that normally means
  `src/project-template/...`, plus the bootstrap generator when needed.

## Guardrail

- For `.agents` / `.afol` layout changes, run focused discovery over config,
  bootstrap, runtime, workbench, skills sync, and docs before proposing the
  implementation path.
- Do not treat `.afol/wb/`, local active-session state, or organization-only
  config as the deliverable unless the user explicitly asks for those surfaces.
