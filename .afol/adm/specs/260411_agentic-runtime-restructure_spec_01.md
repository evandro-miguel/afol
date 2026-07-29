---
doc_type: spec
id: 260411_agentic-runtime-restructure_spec_01
theme: agentic-runtime-restructure
status: final
owners:
- orchestrator
created_at: '2026-04-11T22:13:21-03:00'
updated_at: '2026-05-29T09:41:20-03:00'
roadmap_feature: F-13
spec_role: parent
parent_spec: ''
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: .afol/wb/260529_0939_f13-runtime-native-port-closeout/260529_0939_f13-runtime-native-port-closeout_plan_01.md
  task: .afol/wb/260529_0939_f13-runtime-native-port-closeout/260529_0939_f13-runtime-native-port-closeout_task_01.md
  report: .afol/wb/260529_0939_f13-runtime-native-port-closeout/260529_0939_f13-runtime-native-port-closeout_report_01.md
scope:
  repo_areas:
  - cli
  - .afol/adm/tools.json
  - .afol
  - .agents/lock.json
  - .agents/manifest.json
  - .agents/skills
  - docs
  - .github/workflows
risk_level: high
---

# SPEC: agentic-runtime-restructure

## 1) Feature Intent

- Outcome: AFOL exposes one coherent, typed service layer for CLI operations,
  validation, reversible mutations, documentation discovery, and
  governance-aware workflow execution.
- Why: command behavior, metadata, safety policy, and documentation must not
  drift across parallel implementations.
- Roadmap feature: `F-13`
- Role of this spec: final parent contract.

## Current AFOL Contract

- Projects invoke the external `afol` operator. The root `./afol` is a
  factory-only development/package entrypoint and is never exported into a
  downstream project.
- Bun/TypeScript under `cli/**` owns registry, routing, services, validation,
  result envelopes, safety policy, and lifecycle behavior.
- `.afol/config.json` is canonical configuration; governance and mutable state
  live under `.afol/**`.
- `.afol/adm/tools.json` is provider-neutral metadata aligned with the typed
  command registry. Optional adapters may expose the same services only when
  explicitly enabled and tested.
- Retired command routing is absent from the active runtime.
- Historical migration material is retained under
  `.afol/data/migrations/**`; it is not an executable or fallback surface.
- Current Bun/AFOL gates include `bun run typecheck`,
  `./afol validate project --check-drift --json`, focused tests, manifest
  checks, and narrow adapter checks only when adapter code changes.

## 2) Problem

Agents and operators need stable command discovery, safe state changes, and
consistent validation. Those capabilities become difficult to review when
command metadata, execution logic, tool catalogs, docs, and current-state maps
describe different behavior.

The current architecture solves this by treating the typed registry and
services as the single implementation authority and keeping project-owned
state separate from the external operator.

## 3) Users and User Journey

Primary users:

- operators running interactive agents in AFOL-managed repositories;
- maintainers evolving the factory and downstream scaffold;
- agents that need bounded inspection, validation, mutation, and undo.

Journey:

1. An operator invokes `afol <command>` from a governed project.
2. The external operator resolves `.afol/config.json`, command metadata,
   workbench context, safety policy, and output semantics consistently.
3. The TypeScript service executes the operation and returns one typed result.
4. Any enabled adapter reuses the same service boundary rather than creating a
   second implementation.
5. Focused validation proves CLI behavior, metadata currency, safety, and
   workbench traceability.

Failure controls:

- Command behavior changes unexpectedly -> preserve registry/router and
  fixture tests before changing public semantics.
- Mutating tools create unreviewed drift -> require protected-path policy,
  mutation journals, and undo evidence.
- Docs drift from code -> validate catalog and documentation anchors against
  the typed registry.

## 4) Experience and Behavior

Expected behavior:

- `afol` is the only active command front door.
- `cli/registry.ts`, `cli/router.ts`, and `cli/services/**` own operational
  behavior.
- Compact output is default and structured JSON remains available.
- Mutations remain scoped, journaled, reversible where supported, and blocked
  on unsafe paths.
- Governance remains authoritative under `.afol/adm/**`; current-state maps
  remain descriptive under `.afol/pstr/**`.

Boundaries:

- No project-local command runner is exported.
- No long-lived public backend is created.
- Optional adapter work cannot bypass CLI services, lifecycle state, or action
  policy.
- Cache, telemetry, build, and temporary output remain outside versioned
  downstream payloads.

## 5) Scope

In scope:

- TypeScript command registry, router, shared services, and result envelopes;
- safe inspection, search, validation, mutation, archive, patch, and undo
  services;
- provider-neutral command/tool metadata;
- focused catalog, docs, map, CI, and adapter alignment;
- migration provenance retained in AFOL-owned archives.

Out of scope:

- a public HTTP service;
- a second project-local runtime;
- automatic plugin or adapter activation;
- restoring superseded command systems;
- changing roadmap/spec/workbench authority.

## 6) Constraints

- Existing accepted command semantics remain compatibility anchors unless a
  governed feature explicitly changes them.
- Unsafe or ambiguous roots and paths fail before mutation.
- Mutation state is journaled under `.afol/data/mutations/**`.
- Dependency metadata contains no private registry or credential material.
- Goal-state governance stays in `.afol/adm/**`; current-state maps stay in
  `.afol/pstr/**`.
- Downstream payloads contain configuration, provider metadata, governance,
  docs, and AFOL state only.

## 7) Acceptance

- Representative `afol` commands execute through the typed registry and
  services.
- Command/tool metadata and docs align with registry definitions.
- File changes are policy-checked, journaled, and undoable where supported.
- Enabled adapters, if any, call the same service boundary and pass focused
  schema/behavior checks.
- Typecheck, focused tests, project validation, and manifest checks pass.
- The workbench report records verification evidence and final traceability.

Review questions:

- Is there one operational behavior authority?
- Can an agent inspect, validate, mutate, and undo without broad filesystem
  guesswork?
- Are downstream project boundaries free of factory implementation?

## 8) Closure and Historical Provenance

- Accepted implementation evidence:
  - `c24d386` - tool catalog parity.
  - `3e27bac` - status native port.
  - `b22d45f` and `e9a0f44` - knowledge pull native port.
  - `8cd4737` - session catchup native port.
  - `bde5500`, `e918255`, and `7c98199` - knowledge list/search/show native
    port.
  - `8bd9466` - knowledge index native port.
- Closeout session: `.afol/wb/260529_0939_f13-runtime-native-port-closeout/`
- Status: final.
- The exact pre-reconciliation spec is retained under
  `.afol/data/migrations/260726_f29-governance-contract-reconciliation/`,
  with verified bytes and retain-by-default review metadata.
