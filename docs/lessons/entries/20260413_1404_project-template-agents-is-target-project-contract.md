---
doc_type: lesson_entry
id: 20260413_1404_project_template_agents_is_target_project_contract
status: active
created_at: '2026-04-13T14:04:00-03:00'
updated_at: '2026-04-13T14:05:15-03:00'
tags:
- scaffold
- template
- agents
---

# 2026-04-13 - Project template AGENTS is a target project contract

## Context

The exported `src/project-template/AGENTS.md` read like documentation about a
template instead of the operating contract for the repository receiving it.
It also did not make the expected folder structure and `.afol/adm/rules/`
decision points explicit enough.

## Lesson

An exported `AGENTS.md` must speak as the downstream project's governance file.
It should describe that project's goal, expected structure, and applicable rule
files without referring to itself as a template.

## Prevention Rule

When editing `src/project-template/AGENTS.md`, avoid template narration such as
"this template". Use project placeholders, include the expected folder tree,
and point agents to the mandatory `.afol/adm/rules/` files they must follow.

## Guardrail

Keep a focused test that fails if `src/project-template/AGENTS.md` lacks the
project goal, project structure, mandatory rules section, or rule-file links.
