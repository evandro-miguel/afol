---
doc_type: report
id: 260710_1159_typescript-7-toolchain-adoption_report_01
theme: typescript-7-toolchain-adoption
status: final
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Record the governed TypeScript 7 migration outcome, validation evidence, review, and remaining nonblocking drift.
created_at: '2026-07-10T13:30:08-03:00'
updated_at: '2026-07-10T13:30:08-03:00'
roadmap_feature: F-21
parent_spec: 260710_1256_typescript-7-toolchain-adoption_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: 260710_1159_typescript-7-toolchain-adoption_plan_01
  task: 260710_1159_typescript-7-toolchain-adoption_task_01
  postmortem: ''
output_artifacts:
  primary:
    report: 260710_1159_typescript-7-toolchain-adoption_report_01
    task: 260710_1159_typescript-7-toolchain-adoption_task_01
  sidecars:
    brainstorm: ''
    research: ''
    explorer_check: ''
    postmortem: ''
  sidecar_justification:
    brainstorm: not_required
    research: not_required
    explorer_check: not_required
    postmortem: not_required
---

# Report: TypeScript 7 Toolchain Adoption

## Governance Context

- Roadmap feature: `F-21`
- Parent spec: `260710_1256_typescript-7-toolchain-adoption_spec_01`
- Child spec: not required

## Summary

- AFOL now pins exact TypeScript `7.0.2` as its local blocking compiler.
- The failure-masking `typecheck:ts7:informative` nightly lane was removed.
- Bun remains the runtime, transpiler, test runner, and binary builder.
- CI ordering remains frozen install, blocking typecheck, then release
  validation, with a focused regression test protecting that contract.
- All 16 session evidence records have result `passed`.
- No commit or push was created.

## Delivered Changes

- Added and finalized F-21 and its governing parent spec.
- Added F-21 and its spec to governance-history coverage and regression tests.
- Pinned `devDependencies.typescript` and `bun.lock` to exact `7.0.2`.
- Removed the masked nightly compatibility script.
- Added focused assertions for the package compiler pin, canonical typecheck,
  absence of the masked script, and blocking CI step order.
- Finalized the canonical specs-index entry and its internally consistent
  summary counts.

## Files Changed

- `.afol/adm/roadmap/GENERAL-ROADMAP.md`
- `.afol/adm/specs/260710_1256_typescript-7-toolchain-adoption_spec_01.md`
- `.afol/adm/specs/INDEX.md`
- `.afol/data/benchmarks/catalog/scenarios/governance-history/feature-spec-coverage-matrix.json`
- `package.json`
- `bun.lock`
- `cli/tests/release-toolchain.test.ts`
- `cli/tests/validate-internals.test.ts`
- `.afol/wb/260710_1159_typescript-7-toolchain-adoption/`

## Optional Artifacts

- Brainstorm: not created -> not required
- Research: not created -> not required
- Explorer check: not created -> not required
- Postmortem: not created -> not required

## Verification

All command results below come from the session evidence ledger.

### T-01 Governance Coverage

- `bun test cli/tests/validate-internals.test.ts` -> passed ->
  `E-20260710120400950-5c620a`
- `bun run template:check` -> passed -> `E-20260710120401130-c235d9`
- `git diff --check` -> passed -> `E-20260710120401296-98e293`

### T-02 Compiler and CI Contract

- `bun install --frozen-lockfile` -> passed ->
  `E-20260710120631066-5ae309`
- `bun run typecheck` -> passed -> `E-20260710120631235-fbd244`
- `bunx tsc --noEmit -p tsconfig.json --skipLibCheck false` -> passed ->
  `E-20260710120631409-2cd3ea`
- `bun test cli/tests/release-toolchain.test.ts` -> passed ->
  `E-20260710120631568-67c2ef`
- `git diff --check` -> passed -> `E-20260710120631721-3eeff5`

### T-03 Release, Security, and Review

- `bun run lint:biome && bun run lint:oxlint && bun run lint:knip` -> passed ->
  `E-20260710122815382-5b8fd2`
- `bun test` -> passed -> `E-20260710122815556-8f584a`
- `bun run build && bun run manifest:check` -> passed ->
  `E-20260710122815719-67d0b9`
- `afol local-state rebuild --json && afol validate project --json` -> passed ->
  `E-20260710122815891-175452`
- `bun run validate:security:required` -> passed ->
  `E-20260710122816093-d8a977`
- `bun run validate:release (exact clean disposable snapshot)` -> passed ->
  `E-20260710122816269-e3f227`
- `git diff --check` -> passed -> `E-20260710122816436-a2dc6e`
- Independent council review by `review_lead` and `security_reviewer` -> passed
  -> `E-20260710122816604-c3a7f0`

### Clean-Snapshot Provenance Caveat

The release evidence identifies the run as an exact clean disposable snapshot.
The ledger does not retain a snapshot path, base commit, patch digest, or
snapshot manifest. No commit or push exists for this work. The result therefore
proves the release gate for the clean reconstructed session state, but it is not
immutable commit provenance and it is not an in-place run from the dirty shared
worktree.

## Council Review

- The session ledger records approval from `review_lead` and
  `security_reviewer` with no unresolved technical or security blocker.
- A later governance review found that F-21, its parent spec, and its canonical
  index row were not finalized. The roadmap, spec, and index were corrected.
- The F-21 index row is now `final`. The index summary is internally consistent
  at 69 total rows, 2 active rows, 43 final rows, and 24 superseded rows.

## Risks / Follow-ups

- Four historical specs remain absent from the canonical specs index. This
  drift predates F-21 and is nonblocking for this migration:
  - `260615_1350_recurring-problem-guardrails_spec-child_01`
  - `260618_1519_orchestrator-coordination-radar_spec-child_01`
  - `260627_1122_afol-tool-scenario-coverage-and-ux-registry_spec-child_01`
  - `260627_1655_canonical-afol-configuration-rehome_spec_01`
- The index summary reflects its 69 live rows, while the specs directory has 73
  matching spec documents. Reconcile the four historical entries in a separate
  governance-maintenance change.
- TypeScript 7.0 still lacks the stable programmatic compiler API expected in a
  later compiler release. AFOL continues to avoid compiler API dependencies.
- No deployment, commit, or push was performed.

## Output Artifacts (file-first)

- Primary artifact: `260710_1159_typescript-7-toolchain-adoption_report_01`
- Sidecars:
  - brainstorm: not created
  - research: not created
  - explorer_check: not created
  - postmortem: not created
- Sidecar justification:
  - brainstorm: not required for this bounded toolchain migration
  - research: prior analysis and the governing spec supplied the evidence
  - explorer_check: focused source and contract tests covered the touched paths
  - postmortem: no incident or failed rollout required one

## Postmortem Link

- Postmortem: not created

## Lessons

- An informative lane must not convert compiler failure into command success.
- A stable-version migration must pin the stable release instead of a nightly
  tag whose target changes over time.
- A clean-snapshot gate needs retained provenance before it can support an
  immutable release claim.

---

*Report: `260710_1159_typescript-7-toolchain-adoption_report_01`*
