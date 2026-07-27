---
doc_type: spec-child
id: 260726_governance-contract-reconciliation_spec-child_01
theme: governance-contract-reconciliation
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Reconcile accepted governance contracts with the AFOL-only TypeScript runtime without erasing their original history.
created_at: '2026-07-26T18:51:58Z'
updated_at: '2026-07-26T18:51:58Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  spec_test: .afol/adm/specs/F-29/spec-tests/260726_governance-contract-reconciliation_spec-test_01.md
  plan: .afol/wb/260726_1553_governance-contract-reconciliation/260726_1553_governance-contract-reconciliation_plan_01.md
  task: .afol/wb/260726_1553_governance-contract-reconciliation/260726_1553_governance-contract-reconciliation_task_01.md
  report: .afol/wb/260726_1553_governance-contract-reconciliation/260726_1553_governance-contract-reconciliation_report_01.md
risk_level: high
---

# SPEC CHILD: Governance Contract Reconciliation

## Intent

- Outcome: final F-01, F-11, F-13, and F-15 specs describe the current
  AFOL-only TypeScript runtime without presenting retired command systems as
  active, while their exact pre-reconciliation bytes remain reviewable.
- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- Final feature status, accepted closure evidence, identifiers, and historical
  links remain intact; only the active/current contract is reconciled.

## Child Scope Rationale

Four accepted specs still prescribe the retired wrapper, Python/UV runtime,
Just gates, legacy delegation, legacy config authority, or `.agents/z-arq`
archive surface. Their final status is historically correct, but those
directives contradict the repository's AFOL-only operating contract.

This child separates current authority from historical provenance: exact
originals are archived before editing, and the active specs retain accepted
closure facts while naming only the current operator, runtime, state, archive,
and gate surfaces.

## User or Operator Journey

1. An operator or agent reads a final feature spec to understand current AFOL
   behavior.
2. The spec directs them to the external `afol` operator, TypeScript `cli/**`,
   `.afol/config.json`, AFOL-owned state, and Bun/AFOL validation gates.
3. If historical wording is needed, the operator verifies the exact original
   through the migration manifest without reactivating it.

## Boundaries

- In scope:
  - Archive exact originals of the F-01, F-11, F-13, and F-15 parent specs.
  - Reconcile their current contracts while preserving identifiers, final
    status, closure facts, evidence, and links.
  - Add focused content/provenance regression coverage.
  - Rebuild the canonical administration context index and run narrow
    validation.
- Out of scope:
  - A repository-wide legacy-reference scanner or enforcement gate.
  - Runtime behavior changes, compatibility resolver removal, hydrate, full
    suite, benchmark, release, host operations, network, deploy, or `main`.

## Risks and Mitigations

- Historical meaning could be erased -> archive exact bytes with SHA-256,
  size, source commit, retention review, and no deletion approval first.
- A broad negative assertion could reject legitimate history -> test only the
  four active canonical specs and allow history inside the migration archive.
- Final closure could be reinterpreted -> preserve status, IDs, accepted
  evidence, links, and explicit reconciliation notes.

## Acceptance

- [x] Exact originals are retained in a tracked, traversal-safe AFOL migration
      archive with verified provenance.
- [x] The four canonical specs retain their IDs, final status, roadmap links,
      closure facts, and accepted evidence.
- [x] Current contracts name external `afol`, root `./afol` as factory-only,
      TypeScript `cli/**`, `.afol/config.json`, no delegate/legacy routes,
      `.afol/data/migrations/**`, and Bun/AFOL gates.
- [x] F-11 maps current TypeScript surfaces only and limits retired-runtime
      references to explicitly labeled compatibility fixtures/history.
- [x] Focused RED/GREEN proof, context rebuild, project validation, typecheck,
      narrow formatting, and diff review pass.

## Closure

Session `260726_1553_governance-contract-reconciliation` finalized this child
after exact archive/hash verification, focused governance and context
regressions, local-state and context rebuild, project drift validation,
typecheck, narrow Biome and manifest checks, redacted Gitleaks history/worktree
scans, and an OSV scan of all 127 `bun.lock` packages with no vulnerabilities
reported. The work preserves the event-ledger durability child and makes no
new full-suite, build, release, deployment, or global-install claim.
