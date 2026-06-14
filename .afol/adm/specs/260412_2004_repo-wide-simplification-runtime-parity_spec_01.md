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
  - docs/map
  - docs/arc
  - .agents/runtime
  - .agents/scripts
  - .agents/agents
  - .agents/agents-mcp
  - docs/agentic
  - docs/standards
  packages:
  - agentic-runtime
  - agents-scripts
risk_level: high
---

# SPEC: repo-wide-simplification-runtime-parity

## 1) Feature Intent

- Outcome: the scaffold becomes simpler to maintain by consolidating current-state
  documentation, runtime command metadata, and Python command complexity without
  changing the public interactive CLI contract.
- Why now: the repo now has a central `.agents/runtime/` package and an 80%
  scripts coverage gate, so simplification can proceed with executable safety
  instead of broad manual cleanup.
- Roadmap feature: `F-15`
- Role of this spec: parent feature intent for a governed simplification program.

## 2) Problem

- `docs/map/` is the documented current-state map surface, including the
  physical layout view under `docs/map/structure/`; any `docs/arc/structure/`
  references are legacy migration noise and should not be treated as
  current-state evidence.
- The runtime registry and wrapper compatibility layer preserve public commands,
  but command metadata/help/catalog behavior can still drift if future changes
  update only one surface.
- Several Python command modules still rely on complexity ignores or large
  branching functions, which increases review risk for future scaffold changes.
- A repo-wide refactor can easily become a risky big bang unless it is split into
  small, parity-backed slices.

## 3) Users and User Journey

Primary users:

- operators running interactive CLI agents in scaffolded repositories
- maintainers evolving the `.agents` scaffold
- agents using `.agents/runtime` or MCP surfaces for governed maintenance

User journey:

1. An operator invokes `.agents/agents <command>` or `.agents/agents-mcp`.
2. The command behavior remains stable while internals become simpler.
3. Maintainers use `docs/map/` for current-state evidence and `docs/arc/` for
   goal-state governance without competing generated map surfaces.
   The structure view lives under `docs/map/structure/`.
4. Future refactors can target smaller modules with clear tests and coverage
   gates.

Failure or friction points:

- Public command behavior changes accidentally -> keep parity tests before
  changing routing or archiving legacy paths.
- Documentation surfaces conflict -> make `docs/map/` the durable current-state
  location and remove or relocate competing generated map output.
- Complexity reduction lowers coverage -> require focused tests and keep the
  80% scripts coverage gate.

## 4) Experience and Behavior

- Expected behavior:
  - `.agents/agents` and `.agents/agents-mcp` remain stable public launchers.
  - `docs/map/` is the only durable current-state repository map surface.
  - Runtime command metadata is sourced from one registry path where practical.
  - Python simplification happens only when behavior can be verified.
- Boundaries:
  - Do not create a long-lived backend service.
  - Do not add routes, HTTP clients, SQLite, or web service architecture.
  - Do not delete legacy scripts until parity and archive evidence exist.
  - Do not move governance docs into `docs/map/`.

## 5) Scope

In scope:

- Current-state documentation boundary cleanup between `docs/map/` and legacy
  `docs/arc/structure/` references.
- Runtime registry, wrapper help/catalog alignment, and compatibility tests.
- Bounded Python command simplification for complexity hotspots.
- Documentation and index refreshes directly tied to changed behavior.
- Workbench evidence, report, and postmortem for the governed delivery.

Out of scope:

- Replacing the interactive CLI scaffold with a backend service.
- Implementing new external integrations, databases, route systems, or fetch
  surfaces.
- Removing `.agents/scripts/` wholesale.
- Broad style-only rewrites unrelated to parity, map boundaries, or measured
  complexity.
- Requiring a Python universal-skill that is not installed in the repo-local
  skill source.

## 6) Child Spec Strategy

- Child specs required: yes for execution slices with distinct risks.
- Decomposition rule:
  - Use `spec-child` for map boundary cleanup, runtime registry parity, and
    Python command simplification slices when each begins.
  - Use `spec-test` only when the test strategy is itself part of the risk.
- Accepted child specs:
  - Map boundary cleanup: decided and implemented the `docs/map` vs
    `docs/map/structure` policy while retiring `docs/arc/structure`
    references.
  - Runtime registry parity: reduced metadata drift while preserving public
    CLI behavior.
  - Python command simplification: reduced complexity hotspots in batches.

## 7) Constraints and Assumptions

- Assumptions:
  - The repo-local universal-skills source contains only `agentic-folder-sys` and
    `agentic-scaffold-mcp`; Python validation comes from repo tests and lint.
  - `just test-scripts-all` currently enforces the 80% coverage gate.
  - Current route, fetch, and SQLite surfaces are absent and should remain out of
    scope.
- Constraints:
  - Compatibility: preserve `.agents/agents <command>` behavior.
  - Operational: use `.afol/wb/` artifacts and `agentic-folder-sys` for
    governed execution.
  - Documentation: keep current-state evidence in `docs/map/` and goal-state
    governance in `docs/arc/`.
  - Safety: archive before delete under `.agents/z-arq/` and never expose
    secrets.

## 8) Acceptance

- Success looks like:
  - A governed F-15 workstream links roadmap, parent spec, local specs, plan,
    tasks, log, report, and postmortem.
  - `docs/map/structure/` is the canonical durable current-state structure
    index, and `docs/arc/structure/` is no longer treated as a competing
    current-state map.
  - Runtime command metadata and wrapper behavior are easier to verify from one
    registry path.
  - Complexity hotspots are reduced only where focused tests prove behavior.
  - Final gates pass: `just lint`, `just test-scripts-all`, `just test-runtime`,
    `just runtime-mcp-smoke`, and strict workbench verification.
- Review questions:
  - Did every refactor preserve the interactive CLI scaffold contract?
  - Is every archived or moved artifact backed by updated references and
    validation?
  - Did the implementation avoid broad cleanup outside the governed scope?

## 9) Risks and Tradeoffs

- Risk: a single F-15 effort becomes too broad -> Mitigation: use child specs and
  task slices with independent acceptance.
- Risk: docs cleanup blocks code value -> Mitigation: make the map policy
  decision early, then allow runtime and Python slices to proceed independently.
- Risk: C901 cleanup creates churn without clarity -> Mitigation: refactor only
  functions with focused tests and stop when further simplification increases
  risk.
- Tradeoff: keep legacy scripts longer -> Why accepted: compatibility matters
  more than aggressive deletion.

## 10) Rollout and Lifecycle

- Rollout approach:
  - Execute in a new `.afol/wb/` session; do not reuse the completed F-05
    coverage session.
  - Start with governance, then implement child slices in small batches.
- Workstream linkage:
  - Execution must reference `roadmap_feature: F-15` and this parent spec.
- Closure note:
  - The accepted child slices are final in `docs/arc/SPECS/INDEX.md`.
  - The F-15 roadmap entry is final and the current-state map docs are
    reconciled.
- Backout or deferral:
  - Archive moves must be reversible via `.agents/z-arq/`.
  - Runtime and script changes must remain small enough to revert per task.

## 11) Verification Philosophy

- Evidence expected from delivery:
  - Focused test output for each touched command family.
  - C901 before/after evidence where complexity is reduced.
  - Runtime manifest/validate output after registry or MCP changes.
  - Documentation consistency notes for map boundary changes.
- Test philosophy:
  - Prefer focused unit/parity checks first.
  - Run broad gates before closing the workstream.
  - Treat `just lint` and strict workbench verification as mandatory closure
    gates.
- Open questions:
  - None. Execution slices may add child-spec decisions if new evidence appears.

## 12) Acceptance Checklist

- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail
- [x] Verification philosophy explains how execution will be validated
