---
doc_type: lesson_entry
id: lesson_20260607_1657_benchmarks_must_gate_resource_budgets
status: active
created_at: '2026-06-07T16:57:40-03:00'
updated_at: '2026-06-07T16:57:40-03:00'
source: user_correction
tags:
  - benchmarks
  - tokens
  - mutation-testing
---

# Lesson: Benchmarks Must Gate Resource Budgets

## Correction

The user corrected a benchmark review that treated functional scenario pass as
enough while token usage varied from tens of thousands to over one million
tokens.

## Prevention Rule

- Benchmark pass/fail must include resource budgets when efficiency is part of
  the scenario contract.
- Persist per-scenario token usage, not only pack-level totals.
- Add a mutation or equivalent negative-control test for budget gates before
  trusting benchmark measurements.

## Guardrail

When a live-agent benchmark reports a large token discrepancy, inspect whether
the harness gates `token_usage`, `output_tokens`, and per-scenario totals before
accepting the result.
