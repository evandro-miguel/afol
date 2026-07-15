---
doc_type: spec
id: 260521_0040_governance-workbench-system_spec_01
theme: governance-workbench-system
status: final
owners:
- orchestrator
created_at: '2026-05-21T00:40:00+08:00'
updated_at: '2026-05-29T13:20:21-03:00'
roadmap_feature: F-04
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - .afol/wb src/project-template/.afol/wb cli/workbench
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: governance-workbench-system

## 1) Feature Intent

Create a command-managed workbench for plans, specs, tasks, logs, evidence,
reports, sidecars, and closure.

## 2) Problem

Agents lose state in chat and waste tokens opening files just to update routine
status.

## 3) Expected Behavior

Agents can create sessions, link specs, create plans/tasks, start tasks, append
logs, add evidence, mark done, save research sidecars, verify state, and close
sessions via commands.

## 4) Product Boundary

The compiled Bun/TypeScript CLI owns reusable behavior. The project-local
template owns config, governance, provider metadata, and mutable AFOL state; it
must not receive a project-local executable, wrapper, or retired Python runtime.

## 5) Scope

In scope: Session, task, evidence, log, sidecar, closure validation,
command-managed updates.

Out of scope: Replacing issue trackers, complex team permissions, always-on
orchestration.

## 6) Acceptance

Agents can update workbench state via commands; completed tasks require
evidence; logs and research can be saved without flooding chat; closure fails on
missing required state.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?

## 8) Closure

- Accepted implementation evidence: `E-20260528084521802724`.
- Closeout session: `.afol/wb/260528_0833_f04-workbench-core-review-fix/`.
- Historical strict verification used the now-retired `.agents/agents` wrapper.
  Current verification is `afol verify-tasks
  .afol/wb/260528_0833_f04-workbench-core-review-fix --strict`; the historical
  evidence remains provenance, not proof of current release readiness.
- Current close hardening creates or preserves reports, requires explicit
  waiver reasons, and distinguishes `missing` from `waived`; see session
  `.afol/wb/260713_0716_close-waiver-summary-conflict/`.

## 9) Hermes Benchmark Decisions

- Pattern: separate structured state from operator-facing projections.
- Hermes source concept: mature agents keep runtime state queryable through
  explicit contracts instead of treating prose files as the data model.
- Local decision: adapt as `WorkbenchState` core with Markdown plans, tasks,
  reports, and handoffs as projections.
- Acceptance criteria: structured workbench state is the source of truth;
  Markdown can be regenerated or checked against state; task completion still
  requires evidence.
- Non-goals: no always-on orchestration service, no hidden remote state, no
  conversion of the workbench into a general issue tracker.
