---
doc_type: lesson_entry
id: lesson_20260729_1538_multitask_benchmarks_need_relative_gates
status: active
created_at: '2026-07-29T15:38:27-05:00'
updated_at: '2026-07-29T15:38:27-05:00'
source: user_correction
tags:
  - benchmarks
  - task-lifecycle
  - latency
  - token-economy
---

# Lesson: Multi-Task Benchmarks Need Relative Gates

## Correction

The user required batch lifecycle work to prove that agents need fewer AFOL
calls, verification executions, interactions, authored characters, output
tokens, and less time across both ordinary and large task sets.

## Prevention Rule

- Compare sequential and batch paths in the same run to reduce host-jitter bias.
- Require repeated samples with p50 and p95 before making a quality claim.
- Count AFOL calls and actual verification executions separately.
- Measure authored hot-path characters separately from fixture setup.
- Keep a 100-task boundary scenario so an optimization cannot pass only on
  small fixtures.
- Make regressions fail against a versioned baseline; a one-run smoke check must
  never be reported as benchmark proof.

## Guardrail

Run `bun run benchmark:multitask` for a quality comparison. Use
`bun run benchmark:multitask:smoke` only for fast functional feedback.
