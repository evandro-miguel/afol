# Plan: review-residuals

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: planning
- task: T-01 health regression lock
- task: T-02 ctx explain read-only accuracy
- task: T-03 maintenance dry-run UX
- task: T-04 template and skill-mirror drift
- task: T-05 benchmark-doc boundary cleanup
- task: T-06 final verifier

## Objective

- Close the remaining real review issues from the prior pass.
- Leave the already-fixed project-benchmark work alone unless a residual audit
  finds a concrete gap.

## Execution Contract

- Each task is directly executable now and can be delegated to a builder or
  docs executor without extra research.
- Do not touch `.agents/runtime`, `.agents/scripts`, or `.agents/wb`.
- Do not edit product code outside the task scopes below.
- Do not widen into a full health rewrite, a broad docs refresh, or a new
  project-benchmark feature slice.
- If a task discovers that the smallest safe fix is narrower than the planned
  file list, keep the narrower fix and document the decision.

## Scope

- In scope:
  - health default-area regression coverage and UX wording checks;
  - `ctx explain` read-only/compact behavior or matching metadata;
  - maintenance as dry-run/suggestions UX;
  - template and skill-mirror cleanup for retired instructions;
  - benchmark-doc separation between runtime benchmark packs and
    `project-benchmark`, plus the health release/doctor mention where missing.
- Out of scope:
  - project-benchmark command/scoring/help rewrites already fixed;
  - broad docs rewrites outside the named files;
  - legacy `.agents/runtime`, `.agents/scripts`, `.agents/wb`, or global
    `~/.codex` changes;
  - commit, push, or branch surgery.

## Success Criteria

- Health tests lock the current default areas
  `adm,pstr,wb,memory,library,state,ctx,token_budget` unless live evidence
  proves that claim wrong.
- `ctx explain` no longer implies a hidden write, or the metadata/test contract
  states that behavior explicitly.
- Maintenance output reads as dry-run plan UX, not applied maintenance.
- The AGENTS/template mirrors remove retired instructions and stay aligned with
  the downstream scaffold copy.
- Benchmark docs clearly separate runtime benchmark material from
  `project-benchmark` catalog material and mention the health release/doctor
  path where relevant.
- Final validation passes the targeted checks and only runs the release lane if
  one of the touched surfaces requires it.

## Delivery Strategy

1. T-01 health regression lock.
   - Owner: builder.
   - Allowed write scope: `cli/tests/health-system.test.ts`.
   - Conditional scope: `cli/services/health/checker.ts` only if the test
     evidence proves the current default-area claim is actually wrong.
   - Forbidden: ctx, maintenance, docs, benchmark, and retired runtime
     surfaces.
   - Validate: `bun test cli/tests/health-system.test.ts`.
2. T-02 ctx explain read-only accuracy.
   - Owner: builder.
   - Allowed write scope: `cli/commands/context.ts`,
     `cli/services/context/bundler.ts`,
     `cli/services/context/section-index.ts`,
     `cli/tests/context-system.test.ts`.
   - Forbidden: health, maintenance, docs, benchmark, and retired runtime
     surfaces.
   - Validate: `bun test cli/tests/context-system.test.ts`.
3. T-03 maintenance dry-run UX.
   - Owner: builder.
   - Allowed write scope: `cli/commands/maintenance.ts`, `cli/registry.ts`,
     `cli/tests/maintenance.test.ts`, `cli/tests/registry.test.ts`.
   - Forbidden: ctx, health core logic, docs, benchmark, and retired runtime
     surfaces.
   - Validate: `bun test cli/tests/maintenance.test.ts cli/tests/registry.test.ts`.
4. T-04 template and skill-mirror drift.
   - Owner: docs.
   - Allowed write scope: `docs/templates/AGENTS_TEMPLATE.md`,
     `src/project-template/AGENTS.md`,
     `src/project-template/docs/templates/AGENTS_TEMPLATE.md`,
     `.afol/skills/README.md`,
     `.afol/skills/agentic-folder-sys/gotchas.md`.
   - Forbidden: product code, benchmark catalog data, and retired runtime
     folders.
   - Validate: `bun run validate:template`.
5. T-05 benchmark-doc boundary cleanup.
   - Owner: docs.
   - Allowed write scope: `.afol/adm/project-benchmarks/README.md`,
     `docs/telemetry/HEAT_SCORING.md`,
     `docs/telemetry/QUICK_REFERENCE.md`,
     `docs/telemetry/dashboard.md`.
   - Forbidden: project-benchmark code paths, runtime implementation, and
     retired runtime folders.
   - Validate: `afol validate project --json`.
6. T-06 final verifier.
   - Owner: verifier.
   - Allowed write scope: none unless the verifier isolates a release-gated
     defect to a specific file.
   - Forbidden: any unrelated product edit.
   - Validate: `afol validate project`, `bun run typecheck`, targeted task
     tests, and `bun run validate:release` only if required by the touched
     surfaces.

## Critical Dependencies

- Tools: `afol`, `bun`, `git`, `rg`.
- MCPs: none required.
- Skills: `agentic-folder-sys`, `plan-review`, `code-discovery`, `caveman`.
- Executor instruction: if a task discovers a broader dependency than
  expected, record the concrete file or command evidence and update the risk
  instead of adding a generic research phase.

## Risks And Mitigations

- Risk: the prior review already fixed part of the problem, so a wide sweep
  can re-open stable behavior -> Mitigation: keep each task file-scoped and
  preserve the existing project-benchmark fixes unless validation shows a new
  residual.
- Risk: `ctx explain` can be made read-only in more than one way -> Mitigation:
  choose the smallest path that makes the behavior and tests consistent.
- Risk: docs/template mirrors can drift if only one copy is edited -> Mitigation:
  update the root template and downstream mirror together in T-04.
- Risk: benchmark-doc wording can spill back into code tasks -> Mitigation:
  keep T-05 docs-only and do not reopen project-benchmark code unless a
  concrete residual is found.

## Verification Plan

- T-01: `bun test cli/tests/health-system.test.ts`
- T-02: `bun test cli/tests/context-system.test.ts`
- T-03: `bun test cli/tests/maintenance.test.ts cli/tests/registry.test.ts`
- T-04: `bun run validate:template`
- T-05: `afol validate project --json`
- T-06: `afol validate project`, `bun run typecheck`, targeted task tests, and
  `bun run validate:release` only if required by the touched surfaces

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
- No task broadens into the retired `.agents` runtime surface or a reopened
  project-benchmark fix.
