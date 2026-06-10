# Plan: legacy-system-retirement

## Metadata

- feature_id: F-11
- parent_spec: docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md
- session: 260609_2053_legacy-system-retirement

## Current Facts

- `afol` is the public CLI and the only supported downstream entrypoint.
- Legacy tracked surfaces still exist: `.agents/agents`, `.agents/agents-mcp`, `.agents/scripts/**`, `.agents/runtime/**`, `.agents/wb/**`, `.agents/z-arq/**`, and docs with `.agents/agents` command examples.
- AFOL still needs committed static scaffold metadata under `.agents/`: config, lock, manifest, rules, skills, source seed, benchmark registry, and telemetry schema. These are not the legacy command system.
- Useful mutable or historical state should move under AFOL-owned storage before the old system is removed.

## Scope

- Move retained legacy workbench/archive history out of active `.agents` surfaces into AFOL-owned archival storage.
- Remove legacy Python wrapper/runtime/script entrypoints and AFOL delegate routing to them.
- Remove or rewrite docs and runtime instructions so `AGENTS.md` points only to AFOL and says the old system is discontinued and should be eliminated.
- Keep `.agents` static scaffold surfaces that AFOL still uses.

## Non-Goals

- Do not rewrite unrelated historical specs or lessons except where active guidance would mislead current operators.
- Do not delete user secrets, cache roots outside the repo, or non-repo data.
- Do not publish or commit.

## Risks

- Large deletion/migration can break release template, validation selection, or tests that still assume compatibility routing.
- Moving old `.agents/wb` into active `.afol/wb` would reintroduce strict-evidence failures, so legacy history must be archived outside active WB validation.
- GitNexus blast radius is expected to be high/critical because CLI routing and validation contracts change.

## Execution Plan

- T-01: Orchestrator. Keep the workstream coherent, protect existing dirty work, record evidence, and close the session.
- T-02: State migration. Move useful legacy workbench/archive/map/benchmark state to AFOL-owned archival paths and remove old `.agents/wb`/`.agents/z-arq` active roots.
- T-03: CLI retirement. Remove legacy delegate routing and Python compatibility assumptions from the TypeScript CLI, bootstrap cleanup, validation selection, and tests.
- T-04: Docs and instructions. Rewrite `AGENTS.md`/`CLAUDE.md` and active docs to AFOL-only guidance with explicit legacy-discontinued language.
- T-05: Verification. Run focused tests, project validation, release validation where feasible, and GitNexus changed-scope audit.

## Validation

- `git diff --check`
- `bun run typecheck`
- focused tests for routing/bootstrap/validation/template/status/workbench
- `bun test`
- `afol local-state rebuild --json && afol validate project --json`
- `afol verify-tasks --strict .afol/wb/260609_2053_legacy-system-retirement`
- `bun run validate:release` if focused gates pass
- `npx gitnexus detect-changes -r agentic-start-folder`

## Closure Criteria

- No supported command path delegates to `.agents/agents`, `.agents/scripts`, or `.agents/runtime`.
- Active docs and root agent instructions describe AFOL as the only system.
- Old mutable history is no longer active under `.agents/wb` or `.agents/z-arq`.
- The session closes with task-scoped evidence and explicit residual risks.
