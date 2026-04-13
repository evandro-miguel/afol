---
doc_type: lesson_entry
id: 20260413_1430_templates_only_in_docs_templates
status: active
created_at: "2026-04-13T14:30:00-03:00"
updated_at: "2026-04-13T14:30:00-03:00"
tags: ["scaffold", "template", "docs"]
---

# 2026-04-13 - Templates belong only in `docs/templates/`

## Context

Some reusable template files still lived under other `docs/` subfolders and
were referenced from there.

## Lesson

Reusable templates should exist in one place only: `docs/templates/`.
Other documentation may refer to those files, but it should not host template
copies itself.

## Prevention Rule

When adding or moving template content, place the source file under
`docs/templates/` and update references elsewhere to point there.

## Guardrail

Add a test that fails if `TEMPLATE_*.md` appears outside `docs/templates/`,
and keep source docs free of duplicate template copies.
