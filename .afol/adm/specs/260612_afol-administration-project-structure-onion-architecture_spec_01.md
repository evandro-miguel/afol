---
doc_type: spec
id: 260612_afol-administration-project-structure-onion-architecture_spec_01
theme: afol-administration-project-structure-onion-architecture
status: final
owners:
- orchestrator
created_at: '2026-06-12T13:37:19-03:00'
updated_at: '2026-06-16T00:00:00-03:00'
roadmap_feature: F-18
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
  architecture: .afol/adm/doctrine/ARCHITECTURE.md
  adr: .afol/adm/decisions/ADR-004-afol-administration-and-project-structure.md
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
  current project-structure maps.
- Why now: The project has enough workbench, routing, local-state, and template
  hardening to need a stable inner architecture before adding SQLite hydration,
  memory, library, IWE, context bundles, and spec gates.
- Roadmap feature: `F-18`
- Role of this spec: parent authority and architecture contract.

## 2) Problem

Project direction now lives under `.afol/adm/**`, while current project maps
live under `.afol/pstr/**`. The prior `docs/arc/**` surface is a frozen
transitional archive, not active authority. This closes the weak boundary where
administration, runtime state, and maps could drift across unrelated trees.

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

1. A maintainer changes doctrine, roadmap, specs, or ADRs under `.afol/adm/**`.
2. AFOL treats `docs/arc/**` as archive-only history.
3. AFOL maintains `.afol/pstr/**` for current project-structure maps.
4. AFOL hydrates canonical Markdown/YAML into `.afol/state/afol.db`.
5. AFOL validates source hashes, managed projections, indexes, and drift.
6. AFOL refuses stale maps, stale materialization, stale memory, or stale
   library claims as trusted context unless the command explicitly allows a
   warning-only mode.

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
- `.afol/pstr/**` is target current project-structure maps.
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

Cross-layer policy: Time, freshness, health, cleanup, and token budgets.

- Every durable artifact that can guide an agent has timestamps, status,
  authority, and source metadata.
- Stale state fails closed when it affects done, close, release, or trusted
  context bundle generation.
- Health checks classify findings as `fail`, `warn`, or `info`.
- Cleanup archives logically before moving files.
- Bundles start with refs and summaries, not whole documents.
- AFOL uses a small brain layer internally: shape pack, source axes, hybrid
  retrieval, graph refs, think-lite gap analysis, sweep/doctor, resolver
  routing, and caller trust boundaries.

## 5) Authority Model

Target authority:

```text
Spec/ADR in .afol/adm > Workbench > Evidence ledger > Library > Memory >
SQLite materialization > Chat
```

Archived transitional authority:

```text
docs/arc is historical evidence only and does not outrank .afol/adm.
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
├── index.json
├── cli.md
├── template.md
├── docs.md
└── config.md
```

PSTR is registry-driven and adaptive. Projects do not create empty area maps
for surfaces they do not have.

PSTR map files must be observed and source-backed:

```yaml
---
doc_type: pstr_map
id: pstr_api_endpoints
status: current
authority: observed
scope: api.endpoints
source:
  generated_by: afol pstr rebuild
  command: afol pstr map api endpoints
  source_paths:
    - src/api/
  source_hash: "<hash>"
updated_at: 2026-06-12T00:00:00Z
reviewed_at: 2026-06-12T00:00:00Z
stale_after: 2026-07-12T00:00:00Z
git:
  branch: dev
  commit: abc123
tags:
  - pstr
  - api
---
```

PSTR forbidden content:

- scripts, task execution, or automations,
- roadmap, spec acceptance criteria, ADR decisions, or future-state planning,
- aspirational language such as "should", "future", "roadmap", "proposal", or
  "we should".

PSTR allowed content:

- current entrypoints, modules, routes, services, schemas, data flows,
  integrations, tests, dependencies, critical files, ownership, and observed
  structural gaps.

Materialized execution:

```text
.afol/state/
└── afol.db
```

Ownership classes:

```text
Canônico/versionado:
- .afol/adm/
- .afol/memory/memory.md
- .afol/library/

Mapa observado/versionável:
- .afol/pstr/

Execução:
- .afol/wb/

Derivado/reconstruível:
- .afol/state/
- .afol/data/index/

Append-only/auditoria:
- .afol/data/events/

Temporário:
- .afol/tmp/
```

Stable reference forms:

```text
adm:spec:F-18.S6
pstr:api/auth#Routes
memory:where-we-stopped
library:agent-memory-systems/hermes-memory-system#C-001
wb:260612_1400/T-01
```

## 7) Scope

In scope:

- Define `.afol/adm/**` and `.afol/pstr/**` as target surfaces.
- Keep `docs/arc/**` as frozen transitional archive.
- Define the onion architecture and authority hierarchy.
- Define SQLite as rebuildable execution materialization.
- Separate memory from library.
- Keep IWE as a library provider, never core authority.
- Define migration, drift, and validation requirements.
- Define time, freshness, health, cleanup, archive, branch/commit, and token
  budget requirements.
- Define brain-layer requirements: AFOL shape pack, source axes, think-lite
  bundles, hybrid retrieval, sweep/doctor, resolver routing, and operation trust
  context.
- Define strategy for small specs and large specs:
  - small feature: one `spec.md`;
  - large feature: `spec.md`, `requirements.md`, `design.md`, and `tasks.md`.
- Define adm steering metadata such as `inclusion: always | fileMatch | manual
  | auto` so AFOL can route context without loading all administration docs.

Out of scope:

- Reviving `docs/arc/**` as active authority.
- Implementing SQLite, memory, library, IWE, or context commands in this slice.
- Letting providers mutate `.afol/adm`, `.afol/wb`, `.afol/state`, or evidence
  directly.
- Restoring any legacy `.agents` command/runtime/workbench surface.

## 8) Constraints and Assumptions

Assumptions:

- Some historical docs and tests may still mention `docs/arc/**`; current F-18
  direction and new implementation work must point to `.afol/adm/**`.
- Any remaining migration or archive handling must be command-managed,
  reversible where feasible, and validated by source hashes and indexes.

Constraints:

- `afol` remains the only public front door.
- New implementation logic belongs in `cli/**`.
- Mutable project-local AFOL state belongs under `.afol/**`.
- SQLite must not become an opaque source that overwrites human-authored
  Markdown/YAML outside managed blocks.
- Markdown/YAML owns authorship. SQLite owns speed. IWE owns library graph
  retrieval only. AFOL owns validation and policy.
- JSON snapshots are debug/interchange artifacts, not live competing sources of
  truth.
- `.afol/wb/.active_session` is local convenience only. Multi-agent and
  governed commands must pass explicit session id.
- OperationContext must distinguish local, agent, and remote callers before
  sensitive mutation.
- `adm` owns canonical project intent; memory may summarize intent only when it
  links back to canonical adm docs.
- `adm check-pstr` compares only current pstr maps. If pstr is stale, the
  result is inconclusive and points to rebuild first.

## 9) Acceptance

- Manifesto and architecture document the onion model.
- Roadmap points F-18 at this parent spec.
- `.afol/adm/**` is documented as the target administration surface.
- `.afol/pstr/**` is documented as the target project-structure surface.
- `.afol/pstr/**` is documented as maps only, with code as final authority for
  current implementation structure.
- `docs/arc/**` is explicitly transitional, not silently deprecated.
- Memory, library, SQLite, workbench, evidence, and provider authority are
  separated.
- Adm steering docs can declare inclusion mode for context routing.
- Specs can remain one file when small and split into requirements/design/tasks
  only when feature size justifies it.
- Time, freshness, health, cleanup, archive, branch/commit, and token budget
  policies are documented as cross-layer requirements.
- Stale pstr, stale library docs, stale memory, and stale SQLite materialization
  are excluded from trusted context bundles by default.
- `afol health` and domain health commands are specified as fast-by-default,
  severity-classified checks.
- AFOL shape pack and resolver are documented as target routing contracts.
- Context bundles support think-lite explain output with why, gaps, freshness,
  evidence tags, create-safety hints, and do-not-load.
- Temporal Reliability v1 is the immediate implementation slice for explicit
  path config, pstr stale reporting, trusted-context stale gates,
  state/library/memory health, and maintenance dry-run reports.
- ADR records the supersession of the narrow JSON-source direction.
- Follow-on slices are named without implementing across layers at once.

## 10) Rollout and Lifecycle

Rollout approach:

1. Document architecture and authority boundaries.
2. Keep `.afol/adm` and `.afol/pstr` as active F-18 authority and map
   surfaces.
3. Add SQLite foundation under `.afol/state/`.
4. Add hydration/projection/drift checks.
5. Add memory, library, context bundles, spec gates, and cleanup commands in
   separate slices.
6. Add Temporal Reliability v1: explicit path config, pstr stale reporting,
   trusted-context stale gates, state/library/memory health, and maintenance
   dry-run reports.
7. Add deeper brain-shape retrieval, doctor remediation, resolver, and
   trust-boundary behavior as separate follow-on slices.

Backout or deferral:

- If an old `docs/arc/**` artifact is still needed, link it from `.afol/adm/**`
  as archive evidence instead of restoring it as authority.
- If SQLite is deferred, JSON indexes remain rebuildable caches, not authority.
- If IWE is deferred, library uses native parser/search.

## 11) Verification Philosophy

- Documentation-only changes run `afol local-state rebuild`, `afol validate
  project --json`, and `git diff --check`.
- Implementation slices add focused command, schema, migration, drift, and
  hydration tests.
- Public release claims still require the full release validation lane.
