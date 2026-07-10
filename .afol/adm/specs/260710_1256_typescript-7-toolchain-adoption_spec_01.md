---
doc_type: spec
id: 260710_1256_typescript-7-toolchain-adoption_spec_01
theme: typescript-7-toolchain-adoption
status: final
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define the deterministic adoption of the stable TypeScript 7 compiler for AFOL validation.
created_at: '2026-07-10T12:56:22-03:00'
updated_at: '2026-07-10T12:56:22-03:00'
roadmap_feature: F-21
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - package.json
  - bun.lock
  - .github/workflows
  - cli/tests
  - .afol/adm
  packages:
  - agentic-cli
risk_level: medium
---

# TypeScript 7 Toolchain Adoption

## Intent

Adopt exact TypeScript `7.0.2` as AFOL's local compile-time checker. Keep Bun as
the runtime, transpiler, test runner, and standalone binary builder.

This spec supersedes only the TypeScript baseline statement in the 2026-05-31
DR addendum of the final F-11 spec. The TypeScript 6 minimum and informative
TS7/`tsgo` lane are replaced by an exact, blocking TypeScript 7 compiler
contract. All other F-11 validation, benchmark, security, and historical
decisions remain authoritative and unchanged.

## Problem

AFOL already runs `bun run typecheck` as a blocking CI step. The additional
`typecheck:ts7:informative` script does not prove TypeScript 7 compatibility:
it catches compiler failure, prints a message, and exits successfully. It also
resolves `typescript@next`, which now selects TypeScript 7.1 nightly builds
rather than stable TypeScript 7.

The repository therefore has a deterministic blocking lane for TypeScript 6
and a non-deterministic false-positive lane labelled as TypeScript 7. Stable
TypeScript 7 compatibility has already been demonstrated in an isolated
scratch install, so the production toolchain should encode that result.

## Required Behavior

- `devDependencies.typescript` is exact `7.0.2`, without a range prefix.
- `bun.lock` resolves the same exact compiler version.
- `bun run typecheck` remains the canonical blocking compiler command.
- The masked `typecheck:ts7:informative` script is removed.
- CI keeps this order: frozen dependency install, blocking typecheck, then
  release validation.
- A focused test fails when CI removes, masks, or reorders the blocking
  typecheck contract.
- `bun run validate:release` does not duplicate the standalone typecheck. The
  release runbook and CI keep the typecheck as an explicit preflight.
- `tsconfig.json` stays unchanged unless a stable TypeScript 7 failure provides
  concrete evidence that a configuration change is necessary.
- No compiler failure is converted to success by `if`, `|| true`, shell error
  handling, or an equivalent wrapper.

## Scope

In scope:

- Exact local compiler adoption in `package.json` and `bun.lock`.
- Removal of the obsolete informative compiler lane.
- A focused CI/toolchain contract test.
- Governance coverage for F-21.
- Focused and full repository validation, including security scans.

Out of scope:

- Bun runtime, transpiler, test runner, or bundler changes.
- TypeScript compiler API or language-service integrations.
- Project references, workspaces, or build parallelism.
- Neovim, LazyVim, `tsgo`, mise, or any host configuration under
  `/home/ozy/00_sys/os`.
- Runtime or standalone binary performance claims.
- Adding the standalone typecheck to `validate:release`.

## Constraints and Evidence Baseline

- AFOL does not import `typescript` or use compiler program, compiler host,
  source-file, or language-service APIs.
- The existing Bun-oriented `tsconfig.json` already uses strict checking,
  preserved modules, bundler resolution, isolated modules, erasable syntax,
  Bun types, and no compiler emission.
- An isolated exact `7.0.2` install passed the normal typecheck and a
  `skipLibCheck: false` run.
- The same isolated toolchain passed 979 tests, build, frozen install, and clean
  smoke validation.
- Five local measurements recorded TypeScript 6 at approximately 2.764 seconds
  and TypeScript 7 at approximately 270.8 milliseconds. This compile-time gain
  is evidence for developer feedback and CI latency only.
- TypeScript 7.0 lacks the stable programmatic compiler API expected in 7.1.
  AFOL must not introduce compiler API usage as part of this migration.

## Acceptance

- `package.json` declares exact TypeScript `7.0.2`.
- A frozen Bun install leaves `bun.lock` unchanged and resolves TypeScript
  `7.0.2`.
- The informative TS7 script and its failure-masking shell branch are absent.
- The focused CI contract test proves typecheck is blocking, follows install,
  and precedes release validation.
- The existing `tsconfig.json` remains unchanged unless a documented compiler
  failure justifies the smallest compatible patch.
- Focused tests, full tests, typecheck, strict library checking, static analysis,
  build, release validation, clean smoke, manifest validation, AFOL validation,
  and required security scans pass.
- Validation or scanner failures remain blocking. Missing required scanners are
  reported as blockers rather than silently waived for closure.

## Validation Targets

Run the smallest checks first, then the release-quality gates:

```bash
bun install --frozen-lockfile
bun run typecheck
bunx tsc --noEmit -p tsconfig.json --skipLibCheck false
bun test cli/tests/release-toolchain.test.ts cli/tests/validate-internals.test.ts
bun run lint:biome
bun run lint:oxlint
bun run lint:knip
bun test
bun run build
bun run manifest:check
afol local-state rebuild --json
afol validate project --json
bun run validate:release
bun run smoke:clean
bun run validate:security:required
git diff --check
```

Required security evidence includes Gitleaks coverage over Git history and the
current worktree with redaction enabled, plus an OSV dependency scan of the Bun
lockfile through the repository's required security lane.

## Risks and Tradeoffs

- Risk: a dependency or ambient type exposes a stricter TypeScript 7 diagnostic.
  Mitigation: run focused typecheck first, keep the dependency change isolated,
  and apply only evidence-backed compatibility fixes.
- Risk: a future package introduces compiler API usage that TypeScript 7.0 does
  not support. Mitigation: retain the no-compiler-API boundary until a later
  stable compiler release supports it.
- Risk: CI ordering drifts after the migration. Mitigation: keep the workflow
  contract under a focused test.
- Tradeoff: `validate:release` does not independently invoke typecheck. This is
  accepted because CI and the release runbook treat typecheck as a visible
  standalone preflight and avoid duplicate work.
- Tradeoff: exact pinning gives up automatic patch uptake. This is accepted for
  the first stable TypeScript 7 adoption cycle so CI and local evidence remain
  reproducible.

## Rollout and Rollback

Deliver the governance update, CI contract test, and exact dependency change in
one governed AFOL session. Promote the feature only after focused checks, full
gates, independent review, and security evidence pass.

If stable TypeScript 7 produces an unresolved regression, restore only the
local compiler dependency to exact TypeScript `6.0.3`, regenerate `bun.lock`,
and rerun the same validation gates. Keep the blocking typecheck and CI contract
test. Do not restore the masked informative lane.

Child specs are not required. The change has one compile-time objective, one
rollback boundary, and a small reviewable implementation surface.

## Closure

- Status: final.
- Accepted outcome: exact TypeScript `7.0.2` is the blocking local compiler,
  the masked nightly lane is removed, and focused regression tests protect the
  CI toolchain contract.
- Closure basis: focused, release, build, smoke, governance, and required
  security gates passed in session
  `.afol/wb/260710_1159_typescript-7-toolchain-adoption/`.
