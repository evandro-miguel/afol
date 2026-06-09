---
doc_type: task
id: 260531_2236_benchmark-dev-lane_task_01
theme: benchmark-dev-lane
status: active
created_at: '2026-05-31T23:46:29-03:00'
updated_at: '2026-05-31T23:49:51-03:00'
---

# Tasks: benchmark-dev-lane

## Task List

- Audit current F-11 benchmark contract and lane wording.
- Implement the smallest docs/code changes needed to mark benchmarking as a dev-only regression lane.
- Run the required validation commands and capture output.

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Audit F-11 benchmark contract, current CLI route, and docs wording; confirm no new runner/root unless required. |
| T-02 | done | worker | Apply only the smallest docs/code edits in existing F-11 surfaces. |
| T-03 | done | tester | Run `bun run typecheck`, `bun test cli/tests/validation.test.ts`, `bun run cli/main.ts v --json`, `bun run cli/main.ts v bench --pack cli-kernel-local --json`; add `just lint` if docs change. |
