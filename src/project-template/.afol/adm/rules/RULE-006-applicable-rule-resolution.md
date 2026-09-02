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

**Purpose:** resolve local authority before governed edits.

## Resolution Order

Load the smallest applicable set in this order:

1. `AGENTS.md` and nearer target guidance.
2. Accepted ADRs and active lessons.
3. Resolved `.afol/adm/rules/**`, using RULE-006 cumulatively.
4. `afol help <command>` for live flags and side effects.
5. Governing roadmap/spec, template, tests, and source.

Name the element, rule/spec, and validation before editing. If no rule exists,
state the gap and record follow-up when recurrence is likely.

## Surface Routing

| Element | Guidance |
| --- | --- |
| Ambiguous/product request | Decision intake, parent spec, RULE-002 |
| Feature/workstream | Roadmap, parent spec, RULE-002 |
| Spec or managed doc | RULE-003 and matching template |
| Workbench artifact | `AGENTS.md`, RULE-002/RULE-004, `afol help start \| done \| close` |
| Project-local skill | `AGENTS.md`, rules, `afol help skill`, RULE-002 |
| Code | Project config, nearest tests, language skill |
| Command/tool | `AGENTS.md`, rules, `afol help <command>`, docs/tests |
| Folder/scaffold | RULE-005, template docs, map evidence |
| Validation/release | RULE-004 and command docs |

Guidance is cumulative. `agentic-folder-sys` is not an active AFOL route; do
not require or create a replacement skill. Historical copies are context only.

## Similar Systems

Before creating a command, artifact, or helper:

- Search closest existing code/docs/rules/skills and reuse local patterns.
- Do not refactor the similar system unless this scope includes it.

## Delegation

Pass resolved rule context to delegated agents. Missing context means pause and
ask instead of guessing.

## Validation

Name followed rules, run required checks, and record real rule gaps.

## References

- RULE-002 - Workstream Creation
- RULE-003 - Documentation Standards
- RULE-004 - Validation and Linting
- RULE-005 - Folder Structure
- RULE-009 - Legacy Surface Retirement
