---
doc_type: architecture
id: "ARCHITECTURE_root"
status: active
owners: ["orchestrator"]
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
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
- `docs/arc/**`: goal-state roadmap, specs, architecture, and decisions.
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
  and execution plans.

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
- `.afol/wb/` -> factory workbench history and active local sessions.
- `.agents/scripts/`, `.agents/runtime/`, `.agents/agents` -> factory-only
  compatibility surfaces during migration.
- `.agents/skills/` -> project-local skills.
- `docs/arc/` -> roadmap, specs, architecture, decisions, and execution plans.
- `docs/map/` -> current-state descriptive evidence.

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
- `.afol/wb/`: local workbench state, evidence, logs, reports, and sidecars.
- `.agents/data/events/`: local command and lifecycle event log.
- `.agents/data/index/`: rebuildable local indexes.

Constraints:

- Markdown workbench files are operator projections; structured state is the
  source of truth when parity exists.
- Indexes are rebuildable and must not be trusted when stale.
- Updates preserve or flag user edits before overwrite.
- Factory-only state must not be exported downstream.

## 9) Configuration

Source of truth:

- `AGENTS.md` for runtime instruction behavior.
- `docs/arc/GENERAL-ROADMAP.md` for roadmap direction.
- Parent and child specs under `docs/arc/SPECS/` for feature contracts.
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
