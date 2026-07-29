---
doc_type: spec-test
id: 260727_release-benchmark-timing-and-baseline-contract_spec-test_01
theme: release-benchmark-timing-and-baseline-contract
status: active
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Define deterministic proof for compatible compiled release benchmark timing.
created_at: '2026-07-28T00:52:05.000Z'
updated_at: '2026-07-28T00:52:05.000Z'
roadmap_feature: F-29
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
child_spec: 260727_release-benchmark-timing-and-baseline-contract_spec-child_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  child: .afol/adm/specs/260727_release-benchmark-timing-and-baseline-contract_spec-child_01.md
  validation_contract: .afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md
  agent_cli_contract: .afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md
  plan: .afol/wb/260727_2142_release-benchmark-reliability/260727_2142_release-benchmark-reliability_plan_01.md
  task: .afol/wb/260727_2142_release-benchmark-reliability/260727_2142_release-benchmark-reliability_task_01.md
risk_level: high
---

# SPEC TEST: Release Benchmark Timing and Baseline Contract

## Intent

- Journey or behavior under test: blocking release validation of the
  `mutation-safety` pack with a single compiled artifact and compatible
  scenario-specific timing baselines
- Why this test strategy is needed now: source startup and synthetic baseline
  provenance make current latency failures incomparable
- Related feature: `F-29`, with F-11 release validation and F-03 CLI latency
  and token contracts
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Journey

- Primary user or operator: release engineer or CI agent
- Entry point: `afol validate bench --pack mutation-safety --json`
- Exit condition: all functional gates pass and timing either compares against
  a compatible per-scenario baseline or blocks explicitly as incomparable

## Clicks and Commands

- UI click path: not applicable
- CLI or API command path:
  1. Run focused benchmark internals and release-toolchain tests.
  2. Run typecheck, manifest/template parity, and a diagnostic
     `mutation-safety` pack.
- Inputs and fixtures:
  - Instrumented build runner that counts compilation calls
  - Five compiled-release scenario fixtures
  - Compatible and incompatible host/runtime/execution profiles plus distinct
    valid artifact hashes
  - Per-scenario baseline map with version mismatch cases
  - Blocking sample counts below and at 20
  - Explicit timing-neutral smoke configuration

## Recommended Technology

- Primary test layer: unit and focused integration
- Recommended tools: `bun:test`, isolated temporary repositories, and injected
  command/build runners
- Notes on why this technology is preferred:
  - It can prove orchestration counts and timing boundaries deterministically
    without making wall-clock latency the unit-test oracle.

## Test Construction Strategy

- Test structure:
  - Setup: create a small isolated AFOL fixture and controlled host metadata.
  - Exercise: execute the pack orchestration or profile comparator.
  - Assert: one build, stable artifact reuse, exact counts/provenance, and
    fail-closed compatibility statuses.
  - Teardown: remove only the temporary fixture.
- Coverage focus:
  - Happy path: 20+ samples compare each versioned scenario to a compatible
    baseline below its unchanged SLO.
  - Build boundary: one compiled artifact is reused for warmups and samples;
    setup duration is absent from measured duration.
  - Process boundary: every warmup/sample is a fresh process on a warm host.
  - Profile boundary: host profile id, OS, architecture, CPU class, Bun/runtime,
    execution mode, and artifact mode incompatibility blocks without a
    regression label.
  - Artifact identity boundary: every baseline/result persists a valid
    `artifact_sha256`, while two otherwise compatible release measurements with
    different artifact hashes remain timing-comparable.
  - Temp-state boundary: artifacts and fresh sandboxes remain under
    `.afol/tmp/afol-bench-*`, sandbox copies exclude `.afol/tmp`, and cleanup
    removes only the directory owned by the run.
  - Provenance boundary: real Git SHA, timestamp, host/runtime/artifact fields,
    counts, scenario id, and version are persisted.
  - Sampling boundary: blocking p95 rejects fewer than 20 samples; explicit
    neutral timing remains available only to smoke/test flows.
  - Jitter boundary: mutation regression comparisons allow at least 50 ms of
    absolute process-start variance while the unchanged hard SLO still blocks.
  - Baseline boundary: missing scenario/version and `baseline-fixture` fail.
  - Calibration transition: a minimal, reasoned `pending` baseline is accepted
    structurally, rejects any mixed observed evidence, and yields a single
    blocking `baseline-incompatible:calibration-pending:*` note while
    functional failures retain precedence.
  - Safety boundary: expected exits, side effects, semantic oracles, token
    limits, and hard non-temporal thresholds remain blocking.
  - Parity boundary: source, template, generated catalog, and manifest agree.

## Expected Result

- Functional result: release timing is reproducible and comparable, or fails
  closed with a precise incomparable reason
- Non-functional expectation: scenario SLOs remain 300/350 ms, build/setup is
  unmeasured, and blocking p95 uses at least 20 samples
- Failure messaging expectation: identify the mismatched profile field without
  claiming a product latency regression

## Evidence Plan

- Evidence format in report:
  - Command output snippets: no
  - Screenshots or recordings: no
  - Logs or metrics: persisted compact benchmark result plus AFOL evidence ID
- Pass/fail rule:
  - Focused RED cases must fail before production edits and pass after; the
    diagnostic pack must record the compiled artifact and full provenance.
- Report link target:
  - Governed F-29 workbench report created through the AFOL lifecycle

## Risks and Follow-ups

- Open risk: different CI CPU generations share a coarse label -> Follow-up:
  use a controlled CPU-class identifier and fail closed until intentionally
  calibrated.
- Deferred case: complete release execution -> Owner: parent integration lane
  after focused implementation and independent review.

## Acceptance

- [ ] Journey is explicit
- [ ] Click and command path is explicit
- [ ] Recommended technology is justified
- [ ] Construction strategy is explicit
- [ ] Expected result is explicit
- [ ] Evidence plan is explicit
