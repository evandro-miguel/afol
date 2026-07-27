---
doc_type: spec-test
id: 260726_governance-contract-reconciliation_spec-test_01
theme: governance-contract-reconciliation
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Define focused current-contract and archive-provenance proof for governance reconciliation.
created_at: '2026-07-26T18:51:58Z'
updated_at: '2026-07-26T18:51:58Z'
roadmap_feature: F-29
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
child_spec: 260726_governance-contract-reconciliation_spec-child_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  child: .afol/adm/specs/260726_governance-contract-reconciliation_spec-child_01.md
risk_level: high
---

# SPEC TEST: Governance Contract Reconciliation

## Intent

- Journey or behavior under test: current governance authority and exact
  historical provenance
- Why this test strategy is needed now: final specs can remain valid closure
  records while their prescriptive runtime text becomes stale and unsafe
- Related feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Canonical Position

- `spec-test` is a pre-test strategy artifact, not executable test code.
- The test distinguishes active canonical specs from retained migration
  history; it does not create a broad legacy-reference allowlist.

## Journey

- Primary user or operator: AFOL maintainer or agent reading final governance
- Entry point: F-01, F-11, F-13, and F-15 parent specs
- Exit condition: current AFOL-only contracts are explicit and each exact
  previous file is independently verifiable in the migration archive

## Clicks and Commands

- UI click path: not applicable
- CLI or API command path:
  1. `bun test cli/tests/governance-contract-reconciliation.test.ts`
  2. `./afol ctx build`
  3. `bun test cli/tests/canonical-context-index.test.ts cli/tests/context-system.test.ts cli/tests/validation.test.ts`
  4. `./afol validate project --check-drift --json`
- Inputs and fixtures:
  - The four active canonical parent specs
  - Migration manifest, review, and exact archived originals
  - Git tracked-path evidence for the ignored archive root

## Recommended Technology

- Primary test layer: integration
- Recommended tools: `bun:test`
- Notes on why this technology is preferred:
  - It can validate repository-owned Markdown bytes, SHA-256 metadata, safe
    paths, frontmatter contracts, and Git tracking without hydrate or release
    work.

## Test Construction Strategy

- Test structure:
  - Setup: define exact target IDs, features, archive paths, hashes, and sizes
  - Exercise: read active specs and archived originals
  - Assert: current-only directives, preserved closure metadata, exact
    provenance, safe regular files, and tracked archive paths
  - Teardown: none; the test is read-only
- Coverage focus:
  - Happy path: all four active contracts and all four archives validate
  - Main failure path: any affirmative retired-runtime directive in an active
    target fails with its exact path
  - Boundary condition: legacy wording remains allowed inside the exact archive

## Expected Result

- Functional result: final specs are safe current guidance without losing
  historical proof
- Non-functional expectation: deterministic, focused, offline, and no heavy
  suite
- Failure messaging expectation: identify the exact current or archive
  contract that drifted

## Evidence Plan

- Evidence format in report:
  - Command output snippets: no
  - Screenshots or recordings: no
  - Logs or metrics: yes, through AFOL evidence IDs
- Pass/fail rule:
  - The test is RED against the pre-reconciliation target specs and GREEN only
    after exact archival plus current-contract edits.
- Report link target:
  - Governed F-29 workbench report created through the AFOL lifecycle

## Risks and Follow-ups

- Open risk: future legacy wording outside these four targets -> Follow-up:
  separate scanner-gate child, not this task
- Deferred case: full release and benchmark evidence -> Owner: release lane

## Acceptance

- [x] Journey is explicit
- [x] Click and command path is explicit
- [x] Recommended technology is justified
- [x] Construction strategy is explicit
- [x] Expected result is explicit
- [x] Evidence plan is explicit
