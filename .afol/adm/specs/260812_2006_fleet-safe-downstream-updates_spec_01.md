---
doc_type: spec
id: 260812_2006_fleet-safe-downstream-updates_spec_01
theme: fleet-safe-downstream-updates
status: active
owners:
- orchestrator
workstream_intent: Make downstream AFOL health and update readiness compact, classifiable, and recoverable without unsafe bulk mutation.
artifact_purpose: Define the fleet check, derived-state repair, and future bootstrap improvement contract.
created_at: '2026-08-12T20:06:01Z'
updated_at: '2026-08-12T20:06:01Z'
roadmap_feature: F-33
spec_role: parent
parent_spec: ''
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - cli
  - downstream-projects
  packages:
  - afol-cli
risk_level: high
---

# SPEC: Fleet-Safe Downstream Updates

## 1) Feature Intent

- Outcome: an operator can identify which local projects use AFOL, understand
  their update and health posture, repair only derived state, and prepare
  reviewed update waves without scanning or mutating every repository by hand.
- Why now: the first local fleet audit found current binaries paired with stale
  indexes, historical evidence debt, legacy config fallbacks, missing locks,
  dirty worktrees, and project-owned conflicts.
- Roadmap feature: `F-33`.
- Role: parent specification for fleet operations and later bootstrap hardening.

## 2) Problem

`afol update check`, `afol health`, and `afol validate project` provide useful
project-local facts, but operators lack a bounded fleet view. Running bootstrap
or updates indiscriminately risks overwriting local intent or mixing derived
state repair with scaffold migration.

## 3) User Journey

1. The operator supplies explicit trusted project roots or a bounded registry.
2. AFOL discovers canonical projects without following escaping symlinks or
   scanning secrets, temporary trees, migration archives, or generated fixtures.
3. `fleet check` reports capability, Git posture, config generation, health,
   validation, update conflicts, and a safe classification.
4. The operator may preview derived-state repair.
5. A confirmed repair rebuilds only local projections and rechecks the project;
   scaffold updates remain separate governed work.

## 4) Required Behavior

- Default operations are read-only, compact, deterministic, and bounded.
- One malformed, unknown, or conflicted project fails closed for that project
  without blocking independent healthy projects.
- Dirty Git state is reported and preserved.
- Current `.afol/config.json` and legacy `.agents/config.json` are classified,
  never silently normalized.
- Missing lock, project-owned conflict, unsupported schema, and historical
  evidence debt are not auto-repaired.
- Derived repair can only call the canonical local-state rebuild path and must
  produce before/after receipts.

## 5) Scope

In scope:

- Fleet inventory and compact classification.
- Stable human and JSON output.
- Derived-state repair preview and confirmed execution.
- Tests using fixtures plus live read-only checks on representative local repos.
- A prepared follow-up workbench for bootstrap conflict and migration work.

Out of scope:

- Bulk `update apply` or `bootstrap` mutation.
- Automatic `--force-managed`.
- Git checkout, commit, reset, merge, or initialization in downstream projects.
- Evidence admission, session closure, archive, deletion, or secret scanning of
  downstream content.

## 6) Acceptance

- A bounded fleet check distinguishes healthy, derived-repairable, conflicted,
  legacy, mixed, and blocked projects.
- Output remains below AFOL token limits for at least 25 projects.
- Derived repair preview writes nothing.
- Confirmed repair changes only AFOL-derived state and revalidates the target.
- Missing locks and dirty/conflicted projects retain their original state.
- Representative local-project checks prove the released binary and repo-local
  development artifact resolve the same fleet contract.

## 7) Risks And Mitigations

- Risk: broad home scanning -> require explicit trusted roots and bounded depth.
- Risk: subprocess output explosion -> capture structured fields with hard byte
  and timeout limits.
- Risk: partial fleet mutation -> isolate locks and receipts per project; never
  provide all-or-nothing claims across repositories.
- Risk: derived repair hides canonical corruption -> rerun validation and keep
  evidence/session failures visible.

## 8) Rollout

1. Implement check and fixture coverage.
2. Implement derived repair preview and guarded apply.
3. Run live read-only checks on the audited fleet.
4. Pilot derived repair only on explicitly selected low-risk projects.
5. Use a fresh follow-up session for bootstrap and conflict-classification
   improvements.

## 9) Verification

- Focused parser, service, output-bound, and failure-isolation tests.
- Full typecheck and test suite.
- Live read-only fleet check with paths and raw diagnostics excluded from output.
- Before/after validation for any explicitly authorized derived repair pilot.
