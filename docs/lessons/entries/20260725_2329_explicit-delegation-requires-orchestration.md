---
doc_type: lesson_entry
id: 20260725_2329_explicit-delegation-requires-orchestration
status: active
created_at: '2026-07-25T23:29:09-03:00'
updated_at: '2026-07-25T23:29:09-03:00'
source: user_correction
tags:
  - delegation
  - orchestration
---

# Lesson: Explicit delegation requires orchestration

## Correction

The user explicitly requested agents for development speed, but the root agent
continued running long validation and security gates serially.

## Prevention Rule

- When the user requests delegation, the root agent coordinates independent
  workstreams and reserves local execution for integration-only checks.
- Parallelize bounded implementation, review, and validation work up to the
  available safe concurrency.
- Keep file ownership explicit and serialize only overlapping mutations or
  lifecycle transitions.

## Guardrail

Before starting a long local command, confirm that it cannot be delegated
safely or combined into the final integration gate.
