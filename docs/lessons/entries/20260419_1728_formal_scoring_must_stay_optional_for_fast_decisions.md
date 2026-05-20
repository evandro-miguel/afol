---
doc_type: lesson_entry
id: lesson_20260419_1728_formal_scoring_must_stay_optional_for_fast_decisions
status: active
created_at: '2026-04-19T17:28:00-03:00'
updated_at: '2026-04-19T18:07:45-03:00'
source: user_correction
workstream_ref: 260419_1554_decision-intake-orchestrator-improvements
tags:
- orchestration
- prioritization
- decision-intake
- scoring
---

# Lesson: Formal Scoring Must Stay Optional For Fast Decisions

## Correction

The decision-intake update made scoring sound too mandatory. The user clarified
that if they want speed, the agent should not force a score. The agent can
weigh priorities qualitatively from what the user repeats, what is critical,
what blocks progress, and what is less critical.

## Prevention Rule

- Treat formal scoring as an optional aid, not a fixed gate.
- Default to qualitative prioritization when the user wants speed.
- Ask before introducing formal scoring if it would slow the decision.
- If scoring is used, keep opportunity and solution concerns separate and add
  evidence notes.

## Guardrail

- Decision-intake docs and orchestrator skills must say "qualitative by
  default, formal scoring optional" whenever they mention scoring.
