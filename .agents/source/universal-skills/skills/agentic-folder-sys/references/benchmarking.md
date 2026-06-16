---
description: AFOL benchmark and release-readiness guidance, loaded only for benchmark or release tasks.
metadata:
  tags: "agentic-folder-sys, afol, benchmark, release, validation, token-budget"
---

# AFOL Benchmarking And Release Readiness

Use this only when the task touches benchmark catalogs, benchmark results,
release validation, token budgets, or cross-cutting scaffold/template behavior.
Planner, executor, and adoption agents should skip this file unless their task
names a benchmark or release gate.

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

## Release-Readiness Checks

For AFOL source repo scaffold/template/release work:

```bash
afol local-state rebuild --json
afol validate project --json
bun run typecheck
bun test
bun run validate:release
```

Run this broader lane only when a narrow check does not prove the change.

## Benchmark-Agent Output

Report:

- benchmark command;
- scenario or pack id;
- pass/fail/warn counts;
- token or output-size warning if any;
- changed benchmark files;
- whether the result blocks release or is advisory.

Do not paste full benchmark JSON into chat unless the user asks for it.
