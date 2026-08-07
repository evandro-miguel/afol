---
doc_type: spec-child
id: 260727_release-benchmark-timing-and-baseline-contract_spec-child_01
theme: release-benchmark-timing-and-baseline-contract
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Make mutation-safety release timing reproducible, profile-compatible, and artifact-backed.
created_at: '2026-07-28T00:52:05.000Z'
updated_at: '2026-08-02T00:00:00.000Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  validation_contract: .afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md
  agent_cli_contract: .afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md
  spec_test: .afol/adm/specs/F-29/spec-tests/260727_release-benchmark-timing-and-baseline-contract_spec-test_01.md
  plan: .afol/wb/260727_2142_release-benchmark-reliability/260727_2142_release-benchmark-reliability_plan_01.md
  task: .afol/wb/260727_2142_release-benchmark-reliability/260727_2142_release-benchmark-reliability_task_01.md
risk_level: high
---

# SPEC CHILD: Release Benchmark Timing and Baseline Contract

## Intent

- Outcome: the blocking `mutation-safety` release benchmark measures one
  compiled release artifact on a compatible host profile and compares every
  scenario with a truthful, scenario-specific baseline.
- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`
- Related contracts: F-11 validation/release gates and F-03 agent CLI latency,
  output-token, and authored-command budgets.

## Child Scope Rationale

The release gate currently includes repeated Bun source startup and compares
results with a fixture-labelled pack baseline whose provenance and host
compatibility are incomplete. That can report a latency regression when the
measurement is not comparable. This child owns the bounded measurement
contract; it does not weaken the established 300/350 ms scenario SLOs or any
functional and safety oracle.

## User or Operator Journey

1. The operator invokes the blocking `mutation-safety` validation pack.
2. AFOL builds the release CLI exactly once for the pack run, outside measured
   duration, and hashes the artifact.
3. Warmups and measured samples each run in a fresh process and isolated
   sandbox while reusing that one artifact on a warm host.
4. AFOL records at least 20 measured samples for a blocking p95 and persists
   real Git, host, runtime, artifact, scenario-version, and sample provenance.
5. Each scenario is compared only with its matching compatible baseline. An
   incompatible profile fails closed as incomparable without claiming a
   regression.
6. Release remains blocked by functional, expected-exit, side-effect, token,
   and non-temporal threshold failures independently of timing compatibility.

## Required Behavior

- All five `mutation-safety` scenarios declare compiled release execution.
- Release compilation uses the same entrypoint and compiler flags as the
  release build, runs once per pack invocation, and is excluded from
  `duration_ms`.
- Every warmup and sample uses the same artifact, a fresh process, and the
  scenario sandbox contract.
- Pack artifacts and sandboxes live only under
  `.afol/tmp/afol-bench-{release,sandbox}-*`; sandbox export excludes
  `.afol/tmp` so it cannot copy the artifact or recursively copy benchmark
  state, and every success/failure path cleans its owned directory.
- Blocking p95 uses at least 20 measured samples. Focused smoke tests may
  neutralize timing explicitly but must not silently become release evidence.
- Mutation regression comparisons use the greater of the existing 25%
  relative tolerance and a 50 ms process-start jitter floor. The unchanged
  300/350 ms hard scenario SLOs remain independently blocking.
- Results and baselines identify scenario id and version, Git SHA, recorded
  timestamp, host profile id, OS, architecture, controlled CPU class, Bun and
  runtime versions, execution/artifact mode and hash, sample count, and warmup
  count.
- Timing comparison requires compatible host profile id, OS, architecture, CPU
  class, Bun/runtime versions, execution mode, and artifact mode.
  `artifact_sha256` is mandatory provenance identifying each measured release
  artifact, but hash equality with an older baseline is not a compatibility
  condition because distinct releases naturally have distinct hashes.
  Incompatibility is a blocking, explicit incomparable status and note, not a
  regression claim.
- The pack baseline contains scenario-specific timing records. The synthetic
  `baseline-fixture` identity is removed, and every known baseline satisfies
  the unchanged hard SLO for its scenario.
- Before a compatible calibration exists, the catalog uses an explicit minimal
  `pending` state with a concrete reason and no observed provenance or scenario
  metrics. This state is structurally valid but makes `mutation-safety`
  results fail closed as `incompatible`; unrelated validation packs are not
  contaminated by a global registry-contract failure.
- Timing observation mode is never accepted as a blocking release gate.
- Manifest, project-template, generated scenario catalog, and source registry
  remain in parity.

## Boundaries

In scope:

- Benchmark types, registry, command orchestration, scenario execution, focused
  tests, the five `mutation-safety` scenario files, baseline, template mirrors,
  generated artifacts, and manifest

Out of scope:

- Raising the 300/350 ms SLOs, weakening safety/semantic/token oracles,
  deploying, changing `main`, enabling legacy runtimes, or running the complete
  release lane before the focused contract is independently reviewed

## Risks and Mitigations

- Build time contaminates latency -> compile once before warmup and start the
  timer only around the artifact process.
- Host drift looks like product regression -> require exact controlled profile
  compatibility and fail closed as incomparable.
- A low sample count produces unstable p95 -> require at least 20 samples for
  blocking release timing.
- Smoke fixtures accidentally pass release -> make timing neutralization
  explicit and reject observation/neutral modes in release.
- Pack-wide aggregate hides one slow command -> compare each scenario with its
  own versioned baseline and unchanged SLO.

## Acceptance

- [x] RED tests prove build-once artifact reuse, release sample minimum,
      profile incompatibility, scenario baseline identity, and provenance.
- [x] All five scenarios run the compiled release artifact with cold processes
      on a warm host.
- [x] Results and baselines contain real, compatible provenance and counts.
- [x] Incompatible comparisons block without reporting regression.
- [x] Known scenario baselines satisfy unchanged hard SLOs.
- [x] Functional, safety, exit, token, and non-temporal thresholds remain
      independently blocking.
- [x] Focused tests, typecheck, template/manifest checks, and a diagnostic
      `mutation-safety` pack run pass.

## Closure

This child is final in session `260727_2142_release-benchmark-reliability`.
Observed evidence covers the compiled-artifact `mutation-safety` runs with the
synthetic `baseline-fixture` identity removed and incompatible profiles failing
closed; focused tests and the diagnostic pack run passed
(`E-20260729113712841-720b1e`). Within the F-29 `release-benchmark-reliability`
track, the last persisted `bun run validate:release` evidence row
(`E-20260727234711023-db9f84`) recorded a failed result, blocked by the
pending controlled-host calibration and by absent OSV Scanner and Gitleaks
binaries. A separate later PR-review session
(`260729_1624_pr75-review-comments`) recorded a declared `validate:release`
pass on a different commit (`5acd495`, `E-20260729171716177-62a1e1`) followed
by observed SIGTERM failures (`E-20260729171922573-732e0d`,
`E-20260729172612411-ebbe3f`); that session and commit do not authorize the
final HEAD and are not used as final release evidence. The `aa6892c`
validate:release statement is an unverified pre-close historical assertion
with no persisted formal validate:release evidence row or artifact and is
intentionally excluded from release/provenance claims. This closure claims no
passing full-release-gate result; a fresh `bun run validate:release` on the
final HEAD remains a required post-close release verification before any
release/provenance claim.
