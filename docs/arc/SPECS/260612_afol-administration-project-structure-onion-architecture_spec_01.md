---
doc_type: spec
id: 260612_afol-administration-project-structure-onion-architecture_spec_01
theme: afol-administration-project-structure-onion-architecture
status: draft
owners:
- orchestrator
created_at: '2026-06-12T13:37:19-03:00'
updated_at: '2026-06-12T13:37:19-03:00'
roadmap_feature: F-18
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
  architecture: docs/arc/ARCHITECTURE.md
  adr: docs/arc/DECISIONS/ADR-004-afol-administration-and-project-structure.md
scope:
  repo_areas:
  - .afol/adm
  - .afol/pstr
  - .afol/state
  - .afol/wb
  - cli
  - docs/arc
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: afol-administration-project-structure-onion-architecture

## 1) Feature Intent

- Outcome: define AFOL as a layered local execution OS for agents, with
  `.afol/adm/**` as target project administration and `.afol/pstr/**` as target
  present-state project structure.
- Why now: The project has enough workbench, routing, local-state, and template
  hardening to need a stable inner architecture before adding SQLite hydration,
  memory, library, IWE, context bundles, and spec gates.
- Roadmap feature: `F-18`
- Role of this spec: parent authority and architecture contract.

## 2) Problem

The current project direction lives under `docs/arc/**`, while mutable AFOL
runtime state already lives under `.afol/**`. That split was useful during the
transition from the legacy `.agents` runtime, but it now creates a weak
boundary: project administration is outside the AFOL-owned project-local state
tree, and current-state maps have no clear target location.

Without a firmer architecture, later work can accidentally create many parallel
sources of truth: Markdown, JSON, SQLite, memory, library, specs, session state,
and chat.

## 3) Users and User Journey

Primary users:

- maintainers changing project direction,
- orchestrators assigning work,
- worker agents loading context bundles,
- reviewers validating closure and drift.

User journey:

1. A maintainer changes doctrine, roadmap, specs, or ADRs under the current
   administration surface.
2. AFOL treats `docs/arc/**` as canonical until migration commands exist.
3. The migration creates `.afol/adm/**` with manifesto, architecture, roadmap,
   specs, ADRs, changelog, archive, and policy.
4. AFOL creates `.afol/pstr/**` for current-state maps, structure inventories,
   and generated project snapshots.
5. AFOL hydrates canonical Markdown/YAML into `.afol/state/afol.db`.
6. AFOL validates source hashes, managed projections, indexes, and drift.

Failure or friction points:

- `docs/arc/**` and `.afol/adm/**` both exist -> AFOL must declare one active
  authority and fail on ambiguous writes.
- SQLite differs from canonical Markdown/YAML -> AFOL rebuilds or fails closed
  on conflict.
- A provider wants to mutate core direction -> provider is blocked unless the
  mutation goes through AFOL commands, audit, and dry-run where appropriate.

## 4) Onion Layers

Layer 0: Doctrine and invariants.

- Manifesto, architecture, roadmap, ADRs, authority hierarchy.
- Changes require ADR, spec update, changelog entry, and broad validation.

Layer 1: Authority and source boundaries.

- `.afol/adm/**` is target desired-state administration.
- `.afol/pstr/**` is target present-state structure.
- `.afol/wb/**` is session execution.
- `.afol/state/afol.db` is materialized execution state.
- `.afol/data/events/**` is append-only audit.

Layer 2: Contracts and schemas.

- Canonical document contracts, materialized-state contracts, context bundle
  contracts, memory entries, library documents, migration schemas.

Layer 3: Hydration, projection, and drift engine.

- Read Markdown/YAML, validate frontmatter, calculate source hashes, hydrate
  into SQLite, render managed blocks, and detect drift.

Layer 4: Domain services.

- Workbench, memory, library, context, tools, spec, ADR, archive, audit.

Layer 5: Retrieval engines and providers.

- SQLite FTS, native parser, IWE provider behind a library engine interface.

Layer 6: CLI commands.

- `afol` is the only public front door; commands are compact by default and
  JSON-capable for agents/scripts.

Layer 7: Runtime adapters and future integrations.

- Adapters are thin and call AFOL. They do not own state or duplicate logic.

## 5) Authority Model

Target authority:

```text
Spec/ADR in .afol/adm > Workbench > Evidence ledger > Library > Memory >
SQLite materialization > Chat
```

Current transitional authority:

```text
Spec/ADR in docs/arc > Workbench > Evidence ledger > Library > Memory >
SQLite/materialized indexes > Chat
```

Evidence exception:

- Real evidence has authority over claims of execution. If SQLite says a task
  passed but `.evidence.jsonl` has no passed evidence, the task did not pass.

## 6) Target Paths

Administration:

```text
.afol/adm/
├── PROJECT-MANIFESTO.md
├── ARCHITECTURE.md
├── GENERAL-ROADMAP.md
├── CHANGELOG.md
├── SPECS/
├── DECISIONS/
└── archive/
```

Project structure:

```text
.afol/pstr/
├── README.md
├── structure/
├── inventories/
├── maps/
└── snapshots/
```

Materialized execution:

```text
.afol/state/
└── afol.db
```

## 7) Scope

In scope:

- Define `.afol/adm/**` and `.afol/pstr/**` as target surfaces.
- Keep `docs/arc/**` canonical until migration commands exist.
- Define the onion architecture and authority hierarchy.
- Define SQLite as rebuildable execution materialization.
- Separate memory from library.
- Keep IWE as a library provider, never core authority.
- Define migration, drift, and validation requirements.

Out of scope:

- Physically moving `docs/arc/**` in this slice.
- Implementing SQLite, memory, library, IWE, or context commands in this slice.
- Letting providers mutate `.afol/adm`, `.afol/wb`, `.afol/state`, or evidence
  directly.
- Restoring any legacy `.agents` command/runtime/workbench surface.

## 8) Constraints and Assumptions

Assumptions:

- Existing docs and tests still refer to `docs/arc/**`.
- Migration must be command-managed, reversible where feasible, and validated by
  source hashes and indexes.

Constraints:

- `afol` remains the only public front door.
- New implementation logic belongs in `cli/**`.
- Mutable project-local AFOL state belongs under `.afol/**`.
- SQLite must not become an opaque source that overwrites human-authored
  Markdown/YAML outside managed blocks.

## 9) Acceptance

- Manifesto and architecture document the onion model.
- Roadmap points F-18 at this parent spec.
- `.afol/adm/**` is documented as the target administration surface.
- `.afol/pstr/**` is documented as the target project-structure surface.
- `docs/arc/**` is explicitly transitional, not silently deprecated.
- Memory, library, SQLite, workbench, evidence, and provider authority are
  separated.
- ADR records the supersession of the narrow JSON-source direction.
- Follow-on slices are named without implementing across layers at once.

## 10) Rollout and Lifecycle

Rollout approach:

1. Document architecture and authority boundaries.
2. Add migration spec/commands for `.afol/adm` and `.afol/pstr`.
3. Add SQLite foundation under `.afol/state/`.
4. Add hydration/projection/drift checks.
5. Add memory, library, context bundles, spec gates, and cleanup commands in
   separate slices.

Backout or deferral:

- If `.afol/adm` migration is deferred, `docs/arc/**` remains canonical.
- If SQLite is deferred, JSON indexes remain rebuildable caches, not authority.
- If IWE is deferred, library uses native parser/search.

## 11) Verification Philosophy

- Documentation-only changes run `afol local-state rebuild`, `afol validate
  project --json`, and `git diff --check`.
- Implementation slices add focused command, schema, migration, drift, and
  hydration tests.
- Public release claims still require the full release validation lane.
