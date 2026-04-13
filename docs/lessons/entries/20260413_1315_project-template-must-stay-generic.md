---
doc_type: lesson_entry
id: 20260413_1315_project-template-must-stay-generic
status: active
created_at: "2026-04-13T13:15:00-03:00"
updated_at: "2026-04-13T13:15:00-03:00"
tags: ["scaffold", "template", "genericity"]
---

# 2026-04-13 - Project template must stay generic

## Context

The exportable `src/project-template/` baseline still contained production-only
content such as real workbench history, map inventory, and repo-specific
instruction text.

## Lesson

The source template must contain only reusable starter content. Concrete repo
history belongs in the development workspace, not in the export source.

## Prevention Rule

When editing `src/project-template/`, use placeholders and generic starter
content only. Do not copy live repo history, current workbench artifacts,
production map inventories, or repo-specific identifiers into the template.

## Guardrail

Add tests that fail if the template contains concrete repo names, local paths,
or current workbench/history artifacts. Keep the template tree narrow and
generic by default.
