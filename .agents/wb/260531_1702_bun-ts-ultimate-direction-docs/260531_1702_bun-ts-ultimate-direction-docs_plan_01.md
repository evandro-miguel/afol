# Plan: bun-ts-ultimate-direction-docs

## Context

- Target state is implementation-ready, not rewrite-heavy.
- Live stack is Bun `1.3.14` + TypeScript `^5.9.3`; neither TypeScript 6/TS7 nor `citty`, `Valibot`, `Biome`, `Oxlint`, `Knip`, `diff`, or `jsdiff` are installed yet.
- `package.json` currently exposes `afol` in `bin`, runs with `bun run cli/main.ts` in `dev/kernel`, and already has template-policy, bootstrap, and smoke scripts.
- Existing CLI footprint is already split into commands, core/result/schema, registry/router, and tests under `cli/` with a focused test matrix in `cli/tests/*`.

## Documentation status (already completed)

- `docs/arc/PROJECT-MANIFESTO.md` consolidated and active.
- `docs/arc/TECH-STACK.md` reflects Bun 1.3.14 / TS 5.9.3 live state and direction-only planned upgrades.
- `docs/arc/GENERAL-ROADMAP.md` holds DR 2026-05-31 consolidation path and hard constraints.
- `docs/arc/260521_total-reformulation-execution-plan.md` already records the staged strategy and first-slice order.
- `docs/arc/SPECS/260531_0000_template-cli-boundary-hardening_spec_01.md` is active and aligns with F-02 boundary guardrails.
- `docs/arc/SPECS/260521_0010_universal-agent-cli_spec_01.md` is active, includes boundary + delegation stop conditions.
- `docs/arc/SPECS/260521_0020_minimal-project-template_spec_01.md`, `...0070_...`, `...0080_...`, `...0090_...`, `...0110_...` are active and scoped for next implementation.

## What not to do

- no big-bang rewrite.
- no MCP expansion during this starter tranche.
- no SQLite in MVP.
- no UI layer in this sequence.
- no silent overwrite of project-owned files.
- no removal of root legacy `.agents/agents`, `.agents/scripts`, `.agents/runtime`.

## Slice plan (dependency order, implementation-first, conservative and reversible)

### Slice 1 — Baseline audit and policy-state verification

- Scope: `AGENTS.md`, `package.json`, `tsconfig.json`, `docs/arc/PROJECT-MANIFESTO.md`, `docs/arc/TECH-STACK.md`, `docs/arc/GENERAL-ROADMAP.md`, `cli/schemas/template-policy.ts`, `cli/tests/template-policy.test.ts`, `cli/tests/bootstrap-template-cleanliness.test.ts`
- Validation: `git status --short`, `bun run typecheck`, `bun run template:check`, `bun test cli/tests/bootstrap-template-cleanliness.test.ts cli/tests/bootstrap-conflicts.test.ts cli/tests/bootstrap.test.ts`
- Stop/accept criteria: record that current live state and guardrails are captured; no template-policy regressions introduced in baseline; no template path pollution detected in current checked-in `src/project-template/`.

### Slice 2 — Toolchain decision and installation gates

- Scope: `package.json`, `package-lock` equivalent lock outputs (`bun.lockb` managed via Bun), `docs/arc/TECH-STACK.md`
- Validation command stack:
  - evidence command: `cat package.json` and lockfile check in CI/review artifact after edits
  - compatibility checks after install plan: `bun run typecheck` (as current fallback), focused parser/lint smoke with upgraded dependency versions where available
- Stop/accept criteria: add toolchain evidence only when available in repo state; no implementation feature work proceeds with unresolved TS6/citty/Valibot/Biome/Oxlint/Knip/diff/jsdiff install decision.
- Package decisions: TS6 as required minimum for docs target; TS7/tsgo informative only until proven stable.

### Slice 3 — Command result, envelope, and schema consolidation

- Scope: `cli/core/result.ts`, `cli/core/schema.ts`, `cli/main.ts`, `cli/commands/status.ts`, `cli/commands/workbench.ts`, `cli/commands/validate.ts`, `cli/registry.ts`, `cli/router.ts`
- Validation: `bun test cli/tests/kernel.test.ts cli/tests/registry.test.ts cli/tests/validation.test.ts`
- Stop/accept criteria: one typed `ResultEnvelope` contract used by compact and JSON outputs; command request/response errors use shared schema paths; invalid-root/unsupported-command paths return consistent envelope semantics.

### Slice 4 — Project loader, path-jail, and symlink checks

- Scope: `cli/services/project/root.ts`, `cli/services/project/validate.ts`, `cli/services/workbench/lifecycle.ts`, `cli/tests/project-root.test.ts`, `cli/tests/kernel.test.ts`
- Validation: `bun test cli/tests/project-root.test.ts cli/tests/kernel.test.ts`
- Stop/accept criteria: loader must reject outside-root paths, resolve root upward deterministically, block symlink traversal and blocked paths before any mutation.

### Slice 5 — Bootstrap/update ownership and diff preview contracts

- Scope: `cli/commands/bootstrap.ts`, `cli/commands/update.ts`, `cli/services/bootstrap/planner.ts`, `cli/services/bootstrap/cleanup.ts`, `cli/services/update/check.ts`, `cli/services/template/payload.ts`, `cli/tests/bootstrap*.test.ts`, `cli/tests/update-command.test.ts`
- Validation: `bun test cli/tests/bootstrap.test.ts cli/tests/bootstrap-conflicts.test.ts cli/tests/bootstrap-template-cleanliness.test.ts cli/tests/update-command.test.ts`
- Stop/accept criteria: manifest ownership classes are implemented as `managed`, `project-owned`, `generated`, `ignored`, `conflict`; update/apply uses diff previews; no silent overwrite of project-owned paths; conflict cases abort with actionable report.

### Slice 6 — Local-state JSONL and index contracts

- Scope: `cli/services/workbench/lifecycle.ts`, `cli/services/workbench/verify.ts`, `cli/services/rules` (if route), `cli/services/skills` (if route), `cli/tests/workbench-*.test.ts`, `cli/tests/validation.test.ts`
- Validation: `bun test cli/tests/workbench-lifecycle.test.ts cli/tests/workbench-verify.test.ts cli/tests/validate-command.test.ts`
- Stop/accept criteria: JSONL event stream + deterministic index snapshots exist; stale index detection works; queries/read-model paths avoid full-file rescans for hot command paths.

### Slice 7 — Mutation safety, journal, backup, and rollback

- Scope: `cli/commands/*.ts` for mutation entry points, `cli/services/files` (new), `cli/tests/log-command.test.ts`, `cli/tests/validation.test.ts`, plus any migration-safe path policy modules already introduced by slice 6
- Validation: `bun test cli/tests/log-command.test.ts cli/tests/validation.test.ts` plus mutation-focused fixtures.
- Stop/accept criteria: mutating commands use atomic write + journal + backup strategy; every mutation has session/task provenance; protected paths blocked; undo supported where feasible; patch preview path is required for non-trivial writes.

### Slice 8 — Deterministic standalone build and release/security floor

- Scope: `package.json`, `afol`, `cli/main.ts`, `cli/tests/*`, `docs/arc/TECH-STACK.md`, `docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
- Validation command chain:
  - `bun run typecheck`
  - `bun test`
  - `bun run validate:template`
  - `bun run validate:bootstrap`
  - `bun run build`
  - `bun run smoke:dist`
- Stop/accept criteria: deterministic build artifact exists and executes help path; release gate list (Biome/Oxlint/Knip/OSV/Gitleaks or modern equivalents) is declared and wired only after install evidence is in place.

## Dependency order constraints (hard)

- Keep `afol` as canonical command and `./a` as compatibility/local wrapper.
- Keep root legacy compatibility runtime (`.agents/agents`, `.agents/scripts`, `.agents/runtime`) alive until native parity evidence is complete.
- Do not start later slices that touch write-paths before slices 3-5 prove safe contracts.
- Preserve `src/project-template/` state-only boundary before any template downsizing.
- Use slice completion evidence as blockers: each slice must produce passing validation commands and explicit acceptance notes before proceeding.
