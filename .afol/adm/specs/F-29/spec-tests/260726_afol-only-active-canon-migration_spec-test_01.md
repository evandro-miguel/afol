---
doc_type: spec-test
id: 260726_afol-only-active-canon-migration_spec-test_01
theme: afol-only-active-canon-migration
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Define focused proof for AFOL-only active configuration authority.
created_at: '2026-07-26T17:44:04Z'
updated_at: '2026-07-26T17:44:04Z'
roadmap_feature: F-29
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
child_spec: 260726_afol-only-active-canon-migration_spec-child_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  child: .afol/adm/specs/260726_afol-only-active-canon-migration_spec-child_01.md
risk_level: high
---

# SPEC TEST: AFOL-Only Active Canon Migration

## Intent

- Journey or behavior under test: canonical configuration authority and
  downstream no-legacy-config export
- Why this test strategy is needed now: generic fixtures and active doctrine
  still source a retired root configuration despite canonical-first runtime
  behavior
- Related feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Canonical Position

- `spec-test` is a pre-test strategy artifact, not executable test code.
- This strategy protects the active canon without redefining explicit legacy
  fallback compatibility.

## Journey

- Primary user or operator: AFOL operator and downstream scaffold consumer
- Entry point: factory tests, bootstrap template, and project guidance
- Exit condition: all active/generic surfaces use `.afol/config.json`, while an
  explicitly legacy-only fixture still resolves through the fallback

## Clicks and Commands

- UI click path: not applicable
- CLI or API command path:
  1. `bun test cli/tests/active-canon-migration.test.ts`
  2. `bun test cli/tests/file-command-unit.test.ts`
  3. `bun test cli/tests/mutation-safety.test.ts`
  4. `bun test cli/tests/validate-internals.test.ts`
  5. `bun test cli/tests/project-root.test.ts cli/tests/bootstrap-template-cleanliness.test.ts cli/tests/template-policy.test.ts`
- Inputs and fixtures:
  - Canonical source config at `src/project-template/.afol/config.json`
  - Three generic project-root constructors
  - Explicit legacy-only resolver fixture
  - Root/template manifests and generated template payload
  - Root/template `afol-rules` source seed
  - Verified migration archive and checksum manifest

## Recommended Technology

- Primary test layer: integration
- Recommended tools: `bun:test`
- Notes on why this technology is preferred:
  - Existing tests exercise real isolated filesystem roots and generated
    payload contracts without hydrate or host operations.

## Test Construction Strategy

- Test structure:
  - Setup: inspect repository-owned canonical, archive, fixture, and payload
    surfaces
  - Exercise: build generic fixture roots and read export metadata
  - Assert: no active legacy config, canonical copies, verified archive, and
    retained explicit fallback
  - Teardown: existing fixtures remove only their isolated temp roots
- Coverage focus:
  - Happy path: generic fixtures load `.afol/config.json`
  - Main failure path: tracked or exported `.agents/config.json` fails the
    active-canon contract
  - Boundary condition: an explicit legacy-only fixture still resolves
    `.agents/config.json` only when canonical config is absent

## Expected Result

- Functional result: one active configuration authority across factory,
  generic fixtures, guidance, manifests, and downstream payload
- Non-functional expectation: byte-for-byte provenance retained; focused
  sequential execution only
- Failure messaging expectation: tests identify the exact active or exported
  legacy surface

## Evidence Plan

- Evidence format in report:
  - Command output snippets: no
  - Screenshots or recordings: no
  - Logs or metrics: yes, through AFOL evidence ids
- Pass/fail rule:
  - RED fails on current active legacy authority before fixture/production
    changes; the identical test is GREEN after archive, removal, and
    reconciliation. Explicit fallback tests must remain green.
- Report link target:
  - Governed F-29 workbench report created through the AFOL lifecycle

## Risks and Follow-ups

- Open risk: deleting compatibility by broad replacement -> Follow-up: run the
  explicit project-root fallback test unchanged
- Deferred case: broader legacy-surface scanner and other feature governance ->
  Owner: separate governed task

## Acceptance

- [x] Journey is explicit
- [x] Click and command path is explicit
- [x] Recommended technology is justified
- [x] Construction strategy is explicit
- [x] Expected result is explicit
- [x] Evidence plan is explicit
