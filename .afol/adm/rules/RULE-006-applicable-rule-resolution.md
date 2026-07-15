---
doc_type: rule
id: RULE-006
theme: applicable-rule-resolution
version: 1.1
created: 2026-04-18
updated_at: '2026-06-20T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Applicable Rule Resolution

**Purpose:** load the right local rule/spec/skill before governed edits.

## Pre-Edit Check

Before edits, answer:

1. What element am I touching?
2. Which project rule applies?
3. Which spec, standard, template, or skill applies?
4. Which validation proves compliance?

If no project rule exists, state the gap, use closest local guidance, and record
follow-up when recurrence is likely.

## Routing

| Element | Guidance |
| --- | --- |
| Ambiguous/product request | Decision intake, parent spec, RULE-002 |
| Feature/workstream | Roadmap, parent spec, RULE-002 |
| Spec, roadmap, managed doc | RULE-003 and the matching template |
| Workbench artifact | global Codex `agentic-folder-sys`, RULE-002, RULE-004 |
| Project-local skill | `writing-skills`, skills-sync docs, RULE-002 |
| Code | Project config, nearest tests, language skill |
| Runtime command/tool | Command docs/tests, `.afol/adm/tools.json` |
| Folder/scaffold layout | RULE-005, template docs, map evidence |
| Validation/release gate | RULE-004 and affected command docs |

Guidance is cumulative. A code feature also follows feature/workstream rules.

## Similar Systems

Before creating a command, workflow, artifact type, or helper:

- Search closest existing code/docs/rules/skills.
- Reuse local patterns unless they conflict with current requirements.
- Do not refactor the similar system unless the scope includes it.
- Record convergence debt when duplication matters.

## Delegation

The orchestrator passes applicable rule context to delegated agents. If context
is missing, the delegated agent pauses and asks instead of guessing.

## Validation

Before completion, name followed rules, run required validation, and record real
rule gaps in the workstream, roadmap, spec, or report.

## References

- RULE-002 - Workstream Creation
- RULE-003 - Documentation Standards
- RULE-004 - Validation and Linting
- RULE-005 - Folder Structure
