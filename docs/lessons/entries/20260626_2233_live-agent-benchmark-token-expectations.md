---
doc_type: lesson_entry
id: 20260626_2233_live_agent_benchmark_token_expectations
status: active
created_at: '2026-06-26T22:33:11-03:00'
updated_at: '2026-06-26T22:33:11-03:00'
source: user_correction
tags:
  - benchmarks
  - tokens
  - live-agents
---

# Lesson: Live-Agent Benchmark Token Expectations Must Be Realistic

## Correction

The user corrected an unrealistic expectation that a live-agent benchmark should
normally stay below 10k total tokens.

The intended live-agent preset is `gpt-5.4-mini` with a large-token budget
(about 1M input / 300k output), so high total token usage is expected for some
scenarios.

## Lesson

AFOL command output budgets and live-agent total token usage are different
budgets. The 10k hard limit applies to command output entering operator context,
not to total model tokens consumed by a real agent run.

## Prevention

- Gate CLI/output noise separately from provider token spend.
- Set live-agent benchmark token thresholds from measured scenario baselines.
- Use the intended large-context live-agent preset before judging a scenario as
  unrealistic on token capacity alone.
- Treat unusually high live-agent token usage as a cost/regression signal, not
  an automatic expectation that every live scenario should fit under 10k tokens.
