# Tasks: review-residuals

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | pending | builder | Health default-area regression lock; tests first, checker only if evidence proves the claim wrong. |
| T-02 | pending | builder | `ctx explain` must stay read-only/compact or be marked honestly; cover bundle/index behavior. |
| T-03 | pending | builder | Maintenance must read as dry-run plan UX; update command metadata and dedicated tests. |
| T-04 | pending | docs | Remove legacy instructions from template and skill mirrors; keep downstream template copy aligned. |
| T-05 | pending | docs | Separate runtime benchmark docs from `project-benchmark` and add the health release/doctor pointer where missing. |
| T-06 | pending | verifier | Run project validation, typecheck, targeted tests, and release lane only if required. |

## Task Contracts

- T-01
  - Allowed write scope: `cli/tests/health-system.test.ts`.
  - Conditional scope: `cli/services/health/checker.ts` only if the tests prove
    the current default-area claim is wrong.
  - Forbidden: ctx, maintenance, docs, benchmark, and retired runtime
    surfaces.
  - Validate: `bun test cli/tests/health-system.test.ts`.
- T-02
  - Allowed write scope: `cli/commands/context.ts`,
    `cli/services/context/bundler.ts`,
    `cli/services/context/section-index.ts`,
    `cli/tests/context-system.test.ts`.
  - Forbidden: health, maintenance, docs, benchmark, and retired runtime
    surfaces.
  - Validate: `bun test cli/tests/context-system.test.ts`.
- T-03
  - Allowed write scope: `cli/commands/maintenance.ts`, `cli/registry.ts`,
    `cli/tests/maintenance.test.ts`, `cli/tests/registry.test.ts`.
  - Forbidden: ctx, health core logic, docs, benchmark, and retired runtime
    surfaces.
  - Validate: `bun test cli/tests/maintenance.test.ts cli/tests/registry.test.ts`.
- T-04
  - Allowed write scope: `docs/templates/AGENTS_TEMPLATE.md`,
    `src/project-template/AGENTS.md`,
    `src/project-template/docs/templates/AGENTS_TEMPLATE.md`,
    `.afol/skills/README.md`,
    `.afol/skills/agentic-folder-sys/gotchas.md`.
  - Forbidden: product code, benchmark catalog data, and retired runtime
    folders.
  - Validate: `bun run validate:template`.
- T-05
  - Allowed write scope: `.afol/adm/project-benchmarks/README.md`,
    `docs/telemetry/HEAT_SCORING.md`,
    `docs/telemetry/QUICK_REFERENCE.md`,
    `docs/telemetry/dashboard.md`.
  - Forbidden: project-benchmark code paths, runtime implementation, and
    retired runtime folders.
  - Validate: `afol validate project --json`.
- T-06
  - Allowed write scope: none unless the verifier isolates a release-gated
    defect to a specific file.
  - Forbidden: any unrelated product edit.
  - Validate: `afol validate project`, `bun run typecheck`, targeted task
    tests, and `bun run validate:release` only if required by the touched
    surfaces.
