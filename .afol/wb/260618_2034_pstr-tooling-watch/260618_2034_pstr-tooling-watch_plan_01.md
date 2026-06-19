# Plan: pstr-tooling-watch

- Created by native CLI workbench lifecycle.

## Objective

- Add a native PSTR tool registry with incremental scope/cache tracking and a lightweight diff/watch surface so PSTR can report manifest deltas without broad rebuilds or defaulting to external watcher tooling.

## Non-Goals

- No Docker-first watcher or adapter path by default.
- No new watcher dependency such as `chokidar` unless `fs.watch` proves insufficient and the blocker is documented.
- No edits outside the PSTR command/service/test surfaces named below.
- No changes to retired `.agents` runtime surfaces, `docs/map`, or unrelated product code.

## Current Facts

- PSTR currently lives in `cli/services/pstr/{builder,index,types}.ts` plus `cli/commands/pstr.ts`.
- `package.json` has no watcher dependency; the current runtime surface is Bun/TypeScript plus `diff`.
- `cli/validate/selector.ts` already routes changes under `cli/services/pstr/**` and `cli/commands/pstr` to `pstr-integrity`.
- Existing PSTR actions are `rebuild`, `show`, `validate`, `stale`, `section`, `detect`, `suggest`, and `review-candidates`.

## Scope

- In scope: registry model, incremental scope/cache, diff command, watch command, CLI wiring, tests, validation, and evidence.
- Out of scope: Docker or polling-daemon default, repo-wide refactors, `docs/map`, or non-PSTR product code.

## Delivery Strategy

1. T-01: lock the registry contract and incremental cache boundary.
   - Define the registry entry shape, cache keys, and manifest delta fields needed for scoped rebuilds.
   - Decide which source roots are watched and which events force a full rebuild versus a scoped refresh.
   - Output: a frozen contract for `cli/services/pstr/types.ts` and the service split required for implementation.
2. T-02: implement the native tool registry and incremental rebuild/cache path.
   - Extend `cli/services/pstr/builder.ts` to reuse cached scope data, rebuild only affected maps, and emit a delta-friendly snapshot.
   - Keep the default path Bun-native and dependency-light; external adapters stay out of the default path.
   - Output: registry/cache helpers exported from `cli/services/pstr/index.ts`, with tests covering unchanged versus changed scopes.
3. T-03: implement `diff` and `watch` command surface.
   - Add CLI parsing and JSON/human output for `pstr diff` and `pstr watch`.
   - `watch` uses `fs.watch` plus debounce, seeds from the live manifest, and reports manifest deltas after each quiet window; it falls back to a full scoped rebuild on rename, overflow, or unknown path state.
   - `diff` compares the current snapshot against live scope state and prints added, removed, changed, stale, and missing entries.
   - Output: command coverage in `cli/tests/pstr-schema-sweep.test.ts` and CLI smoke coverage for routing and output shape.
4. T-04: validate, record evidence, and close out.
   - Run the narrow PSTR tests first, then typecheck, then AFOL project validation if the new surface affects selector or session coverage.
   - Output: evidence entries for each passed gate, plus a final closeout note with residual risk if any.

## Target Surfaces

- `cli/services/pstr/builder.ts`
- `cli/services/pstr/index.ts`
- `cli/services/pstr/types.ts`
- `cli/commands/pstr.ts`
- `cli/tests/pstr-schema-sweep.test.ts`
- `cli/tests/kernel.test.ts`
- Optional new helpers under `cli/services/pstr/` if splitting cache, diff, and watch keeps the implementation small.

## Allowed Write Scopes

- T-01: this workbench session only.
- T-02: `cli/services/pstr/builder.ts`, `cli/services/pstr/index.ts`, `cli/services/pstr/types.ts`, and narrow test fixtures under `cli/tests/`.
- T-03: `cli/commands/pstr.ts`, `cli/tests/pstr-schema-sweep.test.ts`, `cli/tests/kernel.test.ts`, and new `cli/services/pstr/*` helper modules if needed.
- T-04: no product writes unless a test fix is needed; evidence and workbench docs only.

## Risks and Rollback

- Risk: `fs.watch` behavior differs across platforms and can drop bursts or rename events. Mitigation: debounce, rescan the manifest after each event batch, and treat unknown states as a full scoped rebuild.
- Risk: incremental cache logic can hide stale data. Mitigation: keep hash-based validation against live scope state and make `diff` compare live entries to the last committed snapshot.
- Risk: the new command surface could regress existing JSON envelopes. Mitigation: keep existing action handlers intact, add tests before changing shared parsing, and revert `watch`/`diff` handlers first if needed.
- Rollback path: remove the new watch/diff entrypoints and helper modules, preserve `rebuild/show/validate/stale/section/detect/suggest/review-candidates`, and fall back to full rebuild output.

## Verification Plan

- Primary: `bun test cli/tests/pstr-schema-sweep.test.ts cli/tests/kernel.test.ts`
- Secondary: `bun run typecheck`
- AFOL check: `afol validate project --json`
- Pass means PSTR routing still works, JSON envelopes remain stable, and the selector still classifies PSTR changes correctly.
- Fail means the registry/cache contract or command surface changed without matching tests; fix before closeout.

## Agent Handoffs

- Planner: `agentic-folder-sys` planning + tools; read-only; produce the frozen contract, task ordering, risks, and validation gates.
- T-02 executor: `agentic-folder-sys` execution + tools; may edit only the PSTR service files and local tests; no `docs/map` or retired `.agents` surfaces.
- T-03 executor: `agentic-folder-sys` execution + tools; may edit only PSTR CLI/service/test surfaces; watch/diff should stay Bun-native and dependency-light.
- T-04 reviewer: `agentic-folder-sys` validation + tools; read-only on product code, write evidence only.
