---
doc_type: rule
id: RULE-007
theme: postmortem-governance-review
version: 1.1
created: 2026-04-23
updated_at: '2026-06-20T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Postmortem Governance Review

**Purpose:** final postmortems must decide whether reusable governance updates
are needed.

## Applies When

Use this rule when a workstream creates a postmortem and marks it final. This
rule does not force postmortem creation.

## Required Section

Final postmortems must include `## Governance Promotion Review` with explicit
answers for:

- lesson entry needed?
- rule update needed?
- ADR/decision needed?
- skill or doc update needed?
- evidence/artifacts reviewed?
- follow-up already recorded?

Do not leave placeholders in a final postmortem. If no promotion is needed,
state that explicitly.

## Heuristics

- Lesson: repeated operator correction or reusable failure mode.
- Rule: behavior should become mandatory or gated.
- ADR: architectural boundary, durable tradeoff, or hard-to-reverse policy.
- Skill/doc: future agents need the behavior in local guidance.

## Validation

- Postmortem has no unresolved placeholders.
- `afol verify-tasks --strict` reports no postmortem governance gap.

## References

- RULE-002 - Workstream Creation
- RULE-004 - Validation and Linting
- RULE-006 - Applicable Rule Resolution
