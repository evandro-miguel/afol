---
doc_type: architecture
id: "ARCHITECTURE_root"
status: active
owners: ["orchestrator"]
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-06-12T13:37:19-03:00"
---

# ARCHITECTURE

## 1) Mission

This repository ships the canonical `.agents` scaffold factory and the
Bun/TypeScript-first universal CLI that operates it.

The architecture is split deliberately:

- Universal CLI owns reusable behavior.
- Project template owns local state and policy.
- Factory `.agents/` runtime is development infrastructure, not downstream
  template payload.

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
- `docs/arc/**`: current transitional goal-state roadmap, specs, architecture,
  and decisions.
- `.afol/adm/**`: target project administration surface for manifesto,
  roadmap, specs, ADRs, changelog, archive, and desired-state policy.
- `.afol/pstr/**`: target present-state project structure surface for maps,
  inventories, and generated structure evidence.
- `.agents/**`: factory workbench, rules, skills, validation, and legacy
  compatibility surfaces during migration.

Out of scope:

- Copying factory runtime, scripts, caches, or legacy Python surfaces into the
  downstream template.
- Replacing external agent CLIs or building a long-lived gateway runtime.
- Default raw browser/CDP control, vendor marketplace install, or progressive
  tool discovery before the core command surface is stable.

## 4) High-level System Map

Modules:

- CLI kernel at `cli/**`: command parsing, registry, project-root detection,
  state loading, result envelopes, validation, and compatibility delegation.
- Template baseline at `src/project-template/**`: config, lock, manifest,
  rules, skills, workbench baseline, docs, and local governance state.
- Factory runtime at `.agents/**`: project-local development workbench,
  compatibility wrappers, runtime experiments, validation scripts, and skills.
- Goal-state docs at `docs/arc/**`: roadmap, specs, decisions, architecture,
  and execution plans. This remains canonical until `.afol/adm/**` migration is
  implemented and validated.
- Project administration at `.afol/adm/**`: target canonical desired-state
  surface after migration.
- Project structure at `.afol/pstr/**`: target canonical current-state map and
  structure evidence surface after migration.

Data flow:

1. Operator or agent calls `afol` or compatibility `afol`.
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
- `.afol/pstr/` -> target project structure: current-state maps, inventories,
  generated structure evidence, and project topology snapshots.
- `.afol/state/` -> target SQLite materialized execution state such as
  `.afol/state/afol.db`.
- `.afol/wb/` -> factory workbench history and active local sessions.
- `.agents/scripts/`, `.agents/runtime/`, `.agents/agents` -> factory-only
  compatibility surfaces during migration.
- `.agents/skills/` -> project-local skills.
- `docs/arc/` -> current transitional roadmap, specs, architecture, decisions,
  and execution plans until `.afol/adm` migration lands.
- `docs/map/` -> legacy/transitional current-state descriptive evidence; do not
  recreate it when `.afol/pstr` becomes available.

## 7) Public Interfaces

- CLI:
  - `afol`: stable project-local front door.
  - `afol`: compatibility alias during migration.
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
- `.afol/pstr/`: target current-state project structure and map evidence.
- `.afol/wb/`: local workbench state, evidence, logs, reports, and sidecars.
- `.afol/state/afol.db`: target SQLite execution cache and materialized query
  layer.
- `.afol/data/events/`: local command and lifecycle event log.
- `.afol/data/index/`: rebuildable local indexes.

Constraints:

- Markdown/YAML administration and workbench files remain the canonical
  readable source for humans and agents. SQLite is materialized execution state,
  not an unreviewable replacement.
- SQLite, JSON indexes, and generated snapshots are rebuildable and must carry
  source hashes.
- Indexes are rebuildable and must not be trusted when stale.
- Updates preserve or flag user edits before overwrite.
- Factory-only state must not be exported downstream.

## 9) Configuration

Source of truth:

- `AGENTS.md` for runtime instruction behavior.
- `docs/arc/GENERAL-ROADMAP.md` for current roadmap direction.
- Parent and child specs under `docs/arc/SPECS/` for current feature contracts.
- Target after migration: `.afol/adm/GENERAL-ROADMAP.md` and
  `.afol/adm/SPECS/**`.
- `.agents/config.json`, `.agents/lock.json`, and `.agents/manifest.json` for
  local project state.

Precedence:

1. Explicit command flags and JSON input.
2. Project-local config, lock, manifest, and workbench state.
3. CLI defaults.
4. Compatibility delegation to legacy `.agents/agents` paths until parity is
   proven.

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
  - docs/prompt/process changes: `just lint`
  - CLI changes: `bun run typecheck` and focused `bun test`
  - template/export changes: `bun run validate:template` and
    `bun run validate:bootstrap`
  - cross-cutting scaffold/release changes: `just agents-all`

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

- `docs/arc/GENERAL-ROADMAP.md`
- `docs/arc/SPECS/`
- `docs/arc/DECISIONS/`

---

*Architecture: `docs/arc/ARCHITECTURE.md`*
