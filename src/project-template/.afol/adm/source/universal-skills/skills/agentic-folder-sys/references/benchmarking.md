---
description: AFOL benchmark guidance, loaded only for benchmark tasks.
metadata:
  tags: "agentic-folder-sys, afol, benchmark, validation, token-budget"
---

# AFOL Benchmarking

Use this only when the task touches benchmark catalogs, benchmark results,
token budgets, or benchmarked scaffold behavior. Planner, executor, and
adoption agents should skip this file unless their task names a benchmark.

## Benchmark Boundary

Benchmark state is mutable AFOL state under configured `.afol/**` data paths.
Do not mix benchmark evidence with ordinary implementation evidence unless the
plan says the task is a benchmark lane.

## Token Economy

AFOL is a low-token system:

- default command output above 5,000 tokens is suspect;
- default command output above 10,000 tokens is a bug;
- prefer compact summaries;
- use verbose or full JSON only when resolving a concrete conflict or measuring
  a specific payload.

## Benchmark-Agent Output

Report:

- benchmark command;
- scenario or pack id;
- pass/fail/warn counts;
- token or output-size warning if any;
- changed benchmark files;
- whether the result blocks the governed task or is advisory.

Do not paste full benchmark JSON into chat unless the user asks for it.
