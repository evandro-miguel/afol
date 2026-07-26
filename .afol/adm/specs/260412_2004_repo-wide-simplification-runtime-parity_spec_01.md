---
doc_type: spec
id: 260412_2004_repo-wide-simplification-runtime-parity_spec_01
theme: repo-wide-simplification-runtime-parity
status: final
owners:
- orchestrator
created_at: '2026-04-12T20:04:38-03:00'
updated_at: '2026-05-29T11:59:24-03:00'
roadmap_feature: F-15
spec_role: parent
parent_spec: ''
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - .afol/pstr
  - .afol/adm
  - cli
  - docs/standards
risk_level: high
---

# SPEC: repo-wide-simplification-runtime-parity

## 1) Feature Intent

Keep the AFOL factory simple to maintain by consolidating current-state maps,
command metadata, and implementation complexity without changing accepted
interactive behavior or creating parallel authorities.

## Current AFOL Contract

- Projects invoke the external `afol` operator. The root `./afol` is limited
  to factory development and package execution and is not part of downstream
  project payloads.
- Bun/TypeScript under `cli/**` owns command metadata, routing, services,
  validation, and mutations.
- `.afol/config.json` is canonical project configuration; `.afol/adm/**`
  defines goal-state governance and `.afol/pstr/**` describes current
  structure.
- Mutable execution and derived state remain under `.afol/**`, including
  `.afol/wb/**`, `.afol/data/**`, and `.afol/state/afol.db`.
- Retired command routing is absent from the active runtime.
- Historical migration material is retained under
  `.afol/data/migrations/**`; new archives never use a superseded path.
- Current simplification gates include focused behavior tests,
  `bun run typecheck`, `./afol validate project --check-drift --json`, narrow
  formatting, and AFOL workbench verification.

## 2) Canonical Boundaries

- `.afol/pstr/**` is the only durable current-state repository-map surface.
- `.afol/adm/**` is the desired-state roadmap, specification, decision, rule,
  and strategy surface.
- `cli/registry.ts` and the typed command/service code are the operational
  authority.
- Documentation and generated metadata must reflect those authorities instead
  of creating another one.
- Complexity reduction is bounded to functions with focused behavior tests.
- State DB v1 remains limited to workbench sessions, tasks, source hashes, and
  evidence; broader materialization is a future version.

## 3) Users and Journey

Primary users:

- operators running interactive agents in governed repositories;
- maintainers evolving the factory;
- agents using AFOL services for bounded maintenance.

Journey:

1. An operator invokes `afol <command>`.
2. Public behavior remains stable while maintainers simplify the typed
   implementation in focused slices.
3. Maintainers use `.afol/pstr/**` for current evidence and `.afol/adm/**` for
   governance intent.
4. Focused tests and coverage prove behavior before each simplification lands.

Failure controls:

- Public semantics drift -> run focused registry/router/command tests.
- Documentation surfaces conflict -> validate the ADM/PSTR boundary.
- Complexity work creates broad churn -> stop at the smallest tested unit.
- Archive work loses provenance -> copy exact bytes into an AFOL migration
  pack before editing or moving the active artifact.

## 4) Scope

In scope:

- current-state documentation boundary cleanup;
- typed registry, help, catalog, and behavior alignment;
- bounded command/service simplification;
- documentation and index refreshes directly tied to changed behavior;
- workbench evidence and reports for governed delivery.

Out of scope:

- a backend service or new external integration;
- broad style-only rewrites;
- speculative route, fetch, or data architectures;
- deleting or restoring historical material without explicit approval;
- moving governance into current-state maps.

## 5) Accepted Slice Mapping

The following completed child slices remain historical delivery anchors:

- `260415_2121_scripts-cleanup-optimization_spec-child_01`
- `260528_1723_map-boundary-cleanup_spec-child_01`
- `260528_1745_runtime-registry-parity_spec-child_01`
- `260528_1759_python-command-simplification_spec-child_01`

They prove the accepted simplification sequence. They do not override the
current AFOL contract in this spec.

## 6) Acceptance

- A governed F-15 workstream links roadmap, parent spec, local specs, plan,
  tasks, log, and report.
- `.afol/pstr/**` is the canonical current-state map surface.
- `.afol/adm/**` remains the governance authority.
- Command metadata and behavior resolve from the typed registry and services.
- Complexity changes are bounded and covered by focused tests.
- Current gates use Bun and AFOL commands and strict workbench evidence.
- Archives are reversible, checksummed, retain-by-default, and AFOL-owned.

Review questions:

- Did every simplification preserve accepted interactive behavior?
- Is every moved or reconciled artifact backed by exact archive provenance and
  updated references?
- Did the implementation avoid unrelated cleanup?

## 7) Rollout and Verification

- Execute each non-trivial slice in a new `.afol/wb/**` session bound to its
  feature and parent spec.
- Start with governance, then change one bounded implementation or
  documentation surface at a time.
- Run the narrowest focused tests, typecheck, project validation, and strict
  session verification that prove the changed contract.
- Back out only the affected uncommitted slice; retain the archive and current
  authority until a reviewed replacement is proven.

## 8) Closure and Historical Provenance

- Status: final.
- The accepted child slices are final in `.afol/adm/specs/INDEX.md`.
- The F-15 roadmap entry and current-state map boundary were accepted.
- The exact pre-reconciliation spec is retained under
  `.afol/data/migrations/260726_f29-governance-contract-reconciliation/`.
- The migration manifest records SHA-256, size, source commit, replacement,
  retention review, and `deletion_approved: false`.
