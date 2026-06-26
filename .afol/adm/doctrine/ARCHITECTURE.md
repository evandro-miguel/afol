---
doc_type: architecture
id: "ARCHITECTURE_root"
status: active
owners: ["orchestrator"]
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-06-14T00:00:00-03:00"
---

# ARCHITECTURE

## 1) Mission

This repository ships the `afol` CLI and the Bun/TypeScript-first
implementation under `cli/**` that operates it.

The architecture is split deliberately:

- Universal CLI owns reusable behavior.
- Project template owns local state and policy.
- Factory runtime is development infrastructure, not downstream template
  payload.

## 2) Principles

- Correctness first
- Proof over claims
- Small diffs
- Stable interfaces
- Progressive disclosure docs
- Contract-first command behavior
- Fail-closed dangerous operations
- Local state over hidden runtime services

## 3) Repo Boundaries

In scope:

- `cli/**`: current Bun/TypeScript CLI kernel, router, schemas, validation,
  registry, adapters, and tests.
- `src/project-template/**`: exportable downstream scaffold state and policy.
- `.afol/adm/**`: canonical project administration surface for manifesto,
  roadmap, specs, ADRs, changelog, archive, and desired-state policy.
- `docs/arc/**`: frozen transitional archive retained for reversibility and
  historical reference; see ADR-005.
- `.afol/pstr/**`: target project-structure map surface for how the project is
  organized today. It stores maps only, not scripts, tasks, automations, specs,
  roadmaps, or future-state governance.
- `.agents/**`: retained static provider-facing metadata and skills only:
  `config.json`, `lock.json`, `manifest.json`, and `.agents/skills/**`.
  Hooks, rules, source seeds, factory workbench, validation, and mutable
  runtime state live under `.afol/**`.

Out of scope:

- Copying factory runtime, scripts, caches, or legacy Python surfaces into the
  downstream template.
- Replacing external agent CLIs or building a long-lived gateway runtime.
- Default raw browser/CDP control, vendor marketplace install, or progressive
  tool discovery before the core command surface is stable.

## 4) High-level System Map

Modules:

- CLI kernel at `cli/**`: command parsing, registry, project-root detection,
  state loading, result envelopes, validation, and AFOL-native command
  execution.
- Template baseline at `src/project-template/**`: config, lock, manifest,
  AFOL adm payloads, provider skills, workbench baseline, docs, and local
  governance state.
- Factory runtime: development-only state retained under `.afol/**`.
  `.agents/` remains static provider-facing metadata plus project-local skills
  (`config.json`, `lock.json`, `manifest.json`, `.agents/skills/**`).
- Goal-state docs at `.afol/adm/**`: roadmap, specs, decisions, architecture,
  and execution plans.
- `docs/arc/**` is frozen transitional archive content; ADR-005 records the
  authority transfer.
- Project structure at `.afol/pstr/**`: target canonical current project
  structure map surface after migration.

Data flow:

1. Operator or agent calls `afol`.
2. CLI loads project config, lock, manifest, and targeted local state.
3. Registry resolves the command to an action contract.
4. Guards validate root, path, env, secrets, mode, and side-effect class.
5. Command handler returns a `ResultEnvelope`.
6. Formatter emits compact text or JSON.
7. Mutating commands append workbench, event, or mutation evidence.

## 5) Layering Rules

Layers:

- Doctrine and invariants: manifesto, architecture, roadmap, ADRs, and source
  authority.
- Contracts and schemas: stable typed contracts, schemas, and migrations.
- Hydration/projection/drift: canonical Markdown/YAML hydration into SQLite,
  managed Markdown rendering, source hashes, and drift checks.
- Domain services: workbench, memory, library, context, tools, spec, ADR, and
  audit modules.
- Retrieval engines and providers: SQLite FTS, native Markdown parser, and IWE
  provider behind domain interfaces.
- CLI commands: the single `afol` command surface.
- Runtime adapters: thin integrations that call AFOL instead of owning logic.

Legacy layering still applies during migration:

- Universal CLI: reusable implementation and typed contracts.
- Project template: local state, policy, manifests, locks, and workbench
  baseline.
- Factory workspace: development-only history, compatibility runtime, caches,
  and validation evidence.
- Runtime adapters: thin transport mappings into the CLI core.

Allowed dependencies:

- Runtime adapters -> CLI core.
- CLI core -> project-local state files.
- Bootstrap/export -> `src/project-template/**`.
- Docs and validation -> CLI, template, and factory evidence.

Forbidden dependencies:

- `src/project-template/**` -> factory `.agents/scripts`, `.agents/runtime`,
  `.agents/agents`, caches, or workbench history.
- Runtime adapters -> duplicated business logic.
- Noninteractive commands -> dangerous mutation without explicit approval.
- MCP catalog -> default heavy local tool surface.

## 6) Directory Map

- `cli/` -> Bun/TypeScript implementation and tests.
- `src/project-template/` -> only source for downstream template payload.
- `.afol/adm/` -> target project administration: manifesto, architecture,
  roadmap, specs, ADRs, changelog, archive, and governance policy.
- `.afol/pstr/` -> target project structure: generated current-state maps.
  Current AFOL emits flat area maps from the PSTR area registry, not empty
  nested area folders.
- `.afol/state/` -> target SQLite materialized execution state such as
  `.afol/state/afol.db`.
- `.afol/wb/` -> governed session execution: plan/task/log/evidence files for
  active and closed AFOL sessions.
- `.agents/scripts/`, `.agents/runtime/`, `.agents/agents` -> RETIRED
  (discontinued, not present in repository).
- `.agents/skills/**` -> project-local AFOL-owned skills.
- `docs/arc/` -> frozen transitional archive of roadmap, specs, architecture,
  decisions, and execution plans.
- `docs/map/` -> retired legacy current-state map surface; do not recreate it.

## 7) Public Interfaces

- CLI:
  - `afol`: stable public/project-local front door.
  - Retired `.agents/agents`, `agents.config`, and `legacy:` routes have no
    compatibility alias.
  - Compact text output by default.
  - JSON output through explicit JSON mode.

- Internal interfaces:
  - `ActionSpec`: command metadata, aliases, input schema, side-effect class,
    capabilities, and required guards.
  - `ResultEnvelope`: status, compact text, JSON payload, errors, touched paths,
    mutation id, next-step hint, and metrics.
  - `WorkbenchState`: structured source of truth for session/task/evidence
    state, with Markdown as projection.
  - `BootstrapReport`: create/update/skip/preserve/conflict decisions with
    ownership and provenance.

## 8) Data and Storage

Primary stores:

- `.agents/config.json`: project-local configuration.
- `.agents/lock.json`: scaffold version and compatibility lock.
- `.agents/manifest.json`: managed-file ownership and provenance.
- `.afol/adm/`: target desired-state administration and project direction.
- `.afol/pstr/`: target current project-structure maps.
- `.afol/wb/`: governed session execution, including plan/task/log files,
  evidence ledgers, reports, and sidecars.
- `.afol/state/afol.db`: target SQLite execution cache and materialized query
  layer.
- `.afol/data/events/`: local command and lifecycle event log.
- `.afol/data/index/`: rebuildable local indexes.

Ownership classes:

- Canonical/versioned: `.afol/adm/`, `.afol/memory/memory.md`, and
  `.afol/library/`.
- Observed/versioned maps: `.afol/pstr/`.
- Execution: `.afol/wb/`.
- Derived/rebuildable: `.afol/state/` and `.afol/data/index/`.
- Append-only audit: `.afol/data/events/`.
- Temporary: `.afol/tmp/`.

Constraints:

- Markdown/YAML administration and workbench files remain the canonical
  readable source for humans and agents. SQLite is materialized execution state,
  not an unreviewable replacement.
- SQLite, JSON indexes, and generated snapshots are rebuildable and must carry
  source hashes.
- Indexes are rebuildable and must not be trusted when stale.
- Updates preserve or flag user edits before overwrite.
- Factory-only state must not be exported downstream.
- Active-session files are local convenience only. Multi-agent or governed
  commands must pass an explicit session id.
- Session, map, memory, library, and materialized-state artifacts should record
  ISO UTC timestamps. Branch and commit are required when correctness depends
  on repository state.

PSTR constraints:

- Source code is the final authority for current implementation structure.
  `.afol/pstr/**` is an observed map of that code.
- Every pstr map should carry source metadata: source paths, generated command,
  source hash when available, updated timestamp, scope, and freshness status.
- Allowed statuses: `current`, `stale`, `partial`, `missing`, `archived`.
- PSTR may record observed structural gaps, but it must not turn those gaps into
  plans, acceptance criteria, or roadmap commitments.
- Context bundles should include pstr references, not whole pstr folders.
- Stale pstr maps do not enter context bundles as trusted structure. AFOL must
  warn, rebuild, or fail closed depending on command policy.

Target pstr layout:

```text
.afol/pstr/
├── index.json
├── cli.md
├── template.md
├── docs.md
└── config.md
```

The layout is registry-driven and adaptive. Projects do not create empty area
maps; AFOL emits only the observed areas implemented by the PSTR builder.

Temporal metadata:

```yaml
created_at: 2026-06-12T00:00:00Z
updated_at: 2026-06-12T00:00:00Z
reviewed_at: 2026-06-12T00:00:00Z
stale_after: 2026-07-12T00:00:00Z
status: current
authority: observed
source_hash: "<hash>"
git:
  branch: dev
  commit: abc123
```

Status values: `active`, `current`, `stale`, `closed`, `archived`,
`invalidated`, and `superseded`.

Health and maintenance:

- `afol health` uses materialized state and indexes for fast checks.
- `afol health --deep` performs source re-scan checks.
- `afol health --area <area>` scopes checks to touched surfaces.
- `afol health --release` runs the broader release readiness lane.
- Domain health commands include `adm`, `pstr`, `wb`, `memory`, `library`, `db`,
  and `token` health.

Context budget levels:

```text
L0: compact status
L1: refs and summaries
L2: exact section
L3: full document
L4: repo scan
```

Agents should start at L0/L1. L3/L4 require explicit need.

## 9) Configuration

Source of truth:

- `AGENTS.md` for runtime instruction behavior.
- `.afol/adm/roadmap/GENERAL-ROADMAP.md` for current roadmap direction.
- Parent and child specs under `.afol/adm/specs/` for current feature
  contracts.
- Target after migration: `.afol/adm/roadmap/GENERAL-ROADMAP.md` and
  `.afol/adm/specs/**`.
- `.agents/config.json`, `.agents/lock.json`, and `.agents/manifest.json` for
  local project state.

Target path contract after migration:

```json
{
  "adm_dir": ".afol/adm",
  "pstr_dir": ".afol/pstr",
  "library_dir": ".afol/library",
  "memory_file": ".afol/memory/memory.md",
  "state_db": ".afol/state/afol.db",
  "docs_export_dir": "docs"
}
```

## 9.1 AFOL Shape Pack

AFOL should define a small project shape pack instead of hardcoding every
directory rule into unrelated commands.

Target path:

```text
.afol/adm/schema/afol-shape.yaml
```

The shape pack defines source classes, page types, authority, inclusion rules,
freshness policy, allowed links, and cache keys.

Example:

```yaml
api_version: afol-shape-v1
name: afol-default
version: 0.1.0

page_types:
  - name: adm-spec
    prefix: .afol/adm/specs/
    authority: canonical
    inclusion: task-matched

  - name: pstr-map
    prefix: .afol/pstr/
    authority: observed
    inclusion: surface-matched
    stale_policy: source_hash

  - name: project-memory
    prefix: .afol/memory/memory.md
    authority: continuity
    inclusion: compact

  - name: library-research
    prefix: .afol/library/
    authority: external-knowledge
    inclusion: cited-only
```

Materialized cache keys must include schema pack name, schema version, source
path, source hash, and branch/commit when relevant.

## 9.2 Source Axes

AFOL sources are not equal. Each axis has different authority, freshness,
inclusion, write policy, and health checks.

```text
direction source   = adm
structure source   = pstr
execution source   = wb
continuity source  = memory
knowledge source   = library
runtime source     = state/db
audit source       = events
```

## 9.3 Retrieval Pipeline

Context retrieval should be hybrid but local-first:

1. Exact/path/id match.
2. SQLite FTS.
3. Section index.
4. Wikilink/backlink graph for library and cross-source refs.
5. PSTR structural refs.
6. Freshness/status filter.
7. Lightweight rerank by authority, recency, task surface, graph neighbor score,
   and stale penalty.

Embeddings are optional future providers, not core MVP requirements.

Context modes:

```text
compact  = refs only
balanced = refs + summaries + health/gaps
deep     = selected section expansion
tokenmax = explicit full expansion only
```

Bundle output should include `why`, `gaps`, `evidence_tags`, `freshness`, and
`create_safety` hints so agents know why context was chosen and what not to
trust.

## 9.4 Resolver

Target path:

```text
.afol/adm/routing/resolver.md
```

The resolver maps task surfaces to the minimal adm, pstr, rule, skill, tool,
memory, library, and validation inputs. It prevents agents from loading every
rule, skill, or map by default.

## 9.5 Trust Boundary

AFOL operations should receive an operation context:

```ts
type OperationContext = {
  caller_type: "local" | "agent" | "remote";
  interactive: boolean;
  trust_level: "trusted" | "restricted";
};
```

Default policy:

- local interactive callers may run governed commands with normal safeguards,
- agent callers require dry-run for sensitive mutation and explicit approval for
  promotion or administration changes,
- remote callers are denied by default for sensitive mutation,
- pstr rebuild is allowed because it writes generated maps only,
- adm decision edits require explicit local approval.

Precedence:

1. Explicit command flags and JSON input.
2. Project-local config, lock, manifest, and workbench state.
3. CLI defaults.
4. No legacy `.agents/agents` delegation.

## 10) Security

Non-negotiables:

- Never log secrets
- Never commit secrets
- Least privilege
- Sandbox risky tools
- Noninteractive dangerous operations fail closed.
- Protected paths, env values, and secret-bearing inputs require guard checks.
- Denylist policy is enforced before mutation or adapter execution.
- Bypasses require explicit operator intent, reason, and audit record.

## 11) Observability

Logs:

- Required events:
  - command invocation and outcome,
  - workbench state transition,
  - evidence addition,
  - mutation journal entry,
  - bootstrap/update decision,
  - adapter or lifecycle event when explicitly enabled.

Metrics:

- Required metrics:
  - exit status,
  - latency where available,
  - touched paths,
  - validation outcome,
  - mutation id,
  - benchmark pack result for risky runtime changes.

## 12) Testing Strategy

Fast checks:

- Lint
- Typecheck
- Unit

Confidence checks:

- Integration
- E2E
- Template export validation
- Bootstrap validation
- Runtime-flow benchmark packs when adapter or prompt routing risk is material

Gates:

- What must pass before merge:
  - docs/prompt/process changes: `afol validate project`
  - CLI changes: `bun run typecheck` and focused `bun test`
  - template/export changes: `bun run validate:template` and
    `bun run validate:bootstrap`
  - cross-cutting scaffold/release changes: `afol local-state rebuild --json`,
    `afol validate project --json`, `bun run typecheck`, `bun test`, and
    `bun run validate:release`

## 13) Change Policy

- No mixed refactor + feature unless necessary
- Feature flags for risky changes
- ADR required for:
  - new core dependency
  - new architecture layer
  - breaking interface change

## 14) Hermes Benchmark Decisions

Hermes Agent is used as an architectural benchmark for mature contracts. This
repo adapts the contract patterns, not the product shape.

Adapt:

- registry/tool specs -> `ActionSpec` and `ResultEnvelope` in the CLI kernel,
- toolsets/capabilities -> generated command groups and capability catalogs,
- approval/security guard -> fail-closed noninteractive security floor,
- skills guard -> explicit scan/install/lock policy,
- MCP catalog -> curated, late-bound optional catalog.

Defer:

- optional adapters,
- MCP catalog expansion,
- progressive tool discovery.

Reject:

- raw CDP/browser control by default,
- dangerous noninteractive auto-approval,
- lazy install/vendor marketplace behavior,
- large gateway runtime or monorepo adoption.

## 15) References

- `.afol/adm/roadmap/GENERAL-ROADMAP.md`
- `.afol/adm/specs/`
- `.afol/adm/decisions/`

---

*Architecture: `.afol/adm/doctrine/ARCHITECTURE.md`*
