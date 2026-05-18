---
doc_type: lesson_entry
id: 20260514_2008_project_template_guidance_must_stay_minimal
status: active
created_at: "2026-05-14T20:08:00-03:00"
updated_at: "2026-05-14T20:08:00-03:00"
tags: ["scaffold", "project-template", "docs", "rules", "token-efficiency"]
---

# 2026-05-14 - Project-template guidance must stay minimal

## Context

Starter guidance in `src/project-template` had grown verbose and duplicated
long rationale.
That increased token cost and made local contracts harder to scan.

## Lesson

Project-template local rules/docs should hold only operational contracts:
commands, paths, IDs, states, and gates.
Long rationale belongs to canonical docs/skills.

## Prevention Rule

When editing template rules/docs:

- Keep headings/frontmatter/critical commands.
- Remove repeated explanations and narrative filler.
- Link canonical docs/skills instead of copying rationale.

## Guardrail

During reviews, reject template/rule changes that become prose-heavy without
adding new executable contract details.
