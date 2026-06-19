# Tasks: pstr-tooling-watch

## State Board

| Task | State | Owner | Write Scope | Validation Target | Evidence |
|------|-------|-------|-------------|-------------------|----------|
| T-01 | done | planner | `.afol/wb/260618_2034_pstr-tooling-watch/**` only | freeze registry contract, scope/cache boundary, and watch/diff rules | plan/task docs only |
| T-02 | done | worker | `cli/services/pstr/**`, narrow `cli/tests/` fixtures | `bun test cli/tests/pstr-schema-sweep.test.ts` | one passed `afol evidence` entry after unit coverage |
| T-03 | done | worker | `cli/commands/pstr.ts`, `cli/tests/pstr-schema-sweep.test.ts`, `cli/tests/kernel.test.ts`, optional `cli/services/pstr/*` helpers | `bun test cli/tests/pstr-schema-sweep.test.ts cli/tests/kernel.test.ts` | one passed `afol evidence` entry for diff/watch coverage |
| T-04 | done | reviewer | evidence updates plus this workbench session | `bun run typecheck` and `afol validate project --json` | final passed evidence and closeout note |

## Task Contracts

### T-01

- Goal: freeze the registry contract, incremental scope/cache boundary, and watch/diff rules before code changes start.
- Allowed write scope: workbench docs only.
- Forbidden: product code, `.agents/runtime`, `.agents/scripts`, `docs/map`, `.agents/wb`.
- Suggested skills: `agentic-folder-sys` planning + tools.
- Output: the final plan and task board only.

### T-02

- Goal: implement the native PSTR registry and incremental rebuild/cache path in the service layer.
- Allowed write scope: `cli/services/pstr/**` and narrow `cli/tests/` fixtures only.
- Forbidden: unrelated CLI areas, docs/map, `.agents/runtime`, `.agents/scripts`.
- Suggested skills: `agentic-folder-sys` execution + tools.
- Validation: `bun test cli/tests/pstr-schema-sweep.test.ts`, then `bun run typecheck` if types changed.
- Evidence: one passed `afol evidence` entry after the service and unit tests pass.

### T-03

- Goal: add `pstr diff` and `pstr watch` with Bun-native `fs.watch` plus debounce and manifest delta reporting.
- Allowed write scope: `cli/commands/pstr.ts`, `cli/tests/pstr-schema-sweep.test.ts`, `cli/tests/kernel.test.ts`, and new `cli/services/pstr/*` helpers if needed.
- Forbidden: Docker defaults, new watcher dependencies, unrelated product code.
- Suggested skills: `agentic-folder-sys` execution + tools.
- Validation: `bun test cli/tests/pstr-schema-sweep.test.ts cli/tests/kernel.test.ts`.
- Evidence: one passed `afol evidence` entry covering diff/watch scenarios and JSON envelope stability.

### T-04

- Goal: prove the final surface with typecheck, AFOL validation, and closeout evidence.
- Allowed write scope: evidence updates and workbench docs only.
- Forbidden: product code changes unless a last-minute test fix is required.
- Suggested skills: `agentic-folder-sys` validation + tools.
- Validation: `bun run typecheck` and `afol validate project --json`.
- Evidence: final passed evidence entry plus the closeout note that names any residual risk.
