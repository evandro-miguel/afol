---
doc_type: roadmap
id: 260521_0000_total_reformulation_roadmap_01
status: active
owners:
- orchestrator
created_at: '2026-05-21T00:00:00+08:00'
updated_at: '2026-07-12T21:20:00Z'
---

# GENERAL ROADMAP

## 1) North Star

Build a universal, low-token, Bun/TypeScript-first governance and execution
system for AI agents.

The system should let agents work across projects using the same local protocol,
the same short commands, the same governance structure, the same update model,
and the same execution rules.

## 2) Product Model

The project has two layers:

~~~text
Universal CLI
- owns logic
- implemented in Bun/TypeScript
- versioned and updateable

Project template
- owns local state
- keeps rules, skills, workbench, specs, evidence, logs, config
- installed into each downstream project
~~~

The current reformulation should move from a copied script-heavy scaffold to a
universal CLI plus minimal local project state.

## 3) Strategic Priorities

1. **Extreme agent ease of use** — obvious short happy path; low friction.
2. **Extremely low latency** — hot-path CLI in tens to low hundreds of ms.
3. **Low write-token consumption** — agents must not author giant `afol`
   strings; active-session fast path is first-class (worse to waste model
   output on commands than on compact CLI stdout).
4. **Low forced output tokens** — compact defaults; verbose/full opt-in;
   file-first detail (F-06).
5. **Very high reliability** — short and long forms share one state machine;
   fail closed when session is ambiguous.
6. Minimal local template.
7. Bun/TypeScript as the system core.
8. Smart routing of rules and skills.
9. Safe file operations with mutation tracking.
10. Updateable downstream project installations.
11. Strong validation and closure gates.
12. Future public distribution.

## 4) Current-State Reconciliation

This section is superseded by the current AFOL-only runtime policy.

The active contract is:

1. `afol` is the only supported public CLI surface.
2. Legacy `.agents/agents`, `.agents/scripts`, `.agents/runtime`,
   `.agents/wb`, `.agents/z-arq`, `agents.config`, and `legacy:` routing must
   not be restored or extended.
3. Retained `.agents/**` content is limited to static provider metadata and
   optional project-local skills. Universal AFOL skills such as
   `agentic-folder-sys` are global Codex skills, not vendored template payload.
4. Python, Bash, uv, and Just references are historical migration context, not
   active runtime surfaces.
5. `src/project-template` must export the AFOL config/governance/state payload
   without reintroducing legacy runtime files.

## 4.1) DR 2026-05-31 Consolidation (incremental)

This consolidation updates, not replaces, the existing staged migration.

Critical path (in dependency order):

1. Block template pollution with tests before any shrink operations.
2. Make CLI core ownership explicit for registry, router, result envelope, project loader, and schemas.
3. Keep the exported template minimal and embedded with only policy/state surfaces.
4. Implement template bootstrap/update with manifest ownership (`managed`, `project-owned`, `generated`, `ignored`, `conflict`).
5. Reconcile workbench and evidence flow with strict evidence requirements.
6. Implement local-state JSONL/event logging and compact indexes.
7. Complete mutation safety (path-jail, symlink checks, atomic write, journal, backups, rollback, task/session context).
8. Add release/security gates and deterministic standalone build checks.

`afol` remains the primary command and the only documented downstream entrypoint.
Legacy local wrappers remain factory-only compatibility surfaces while parity is
incomplete.

Boundary guardrails:

- F-02/template boundary: no Python/uv/scripts/runtime payload in `src/project-template` or downstream bootstrap output.
- F-07: local state uses JSONL/JSON artifacts; SQLite remains deferred until scale/query pressure justifies it.
- F-08: mutation writes are session/task constrained with journaling and rollback support.
- F-09: no blind overwrite of project-owned files; update flow must classify managed/project-owned generated/ignored/conflict with conflicts preserved.
- F-11: release/security gate set includes deterministic build checks and token-aware validation, without claiming unverified dependency installation.
- F-11 (MVP): release is hard-gated by `bun run validate:release`, including `bun run coverage:check` at `>=80%` lines/functions before release provenance; security checks are informative by default and require an explicit release waiver record only when OSV/Gitleaks are absent in environment.
- F-12: public distribution remains gated on reproducible `bun install
  --frozen-lockfile`, standalone binary smoke, platform-target evidence,
  checksum/provenance, and explicit macOS notarization disclosure.
- F-12 addendum (MVP): MCP full/native adapters, runtime-live-agent transport, and broad cross-platform binaries remain deferred/waived until validated evidence exists.
- CLI parser/tooling: prefer the local registry plus `citty`; treat Bunli,
  meow, Ace CLI/Bejibun, and other frameworks as references until a spike proves
  a smaller and safer fit.

## 4.2) Hermes-Derived Architecture Hardening

Hermes Agent is a benchmark for mature architectural contracts, not a product
or monorepo to copy. The local decision is to adapt its strongest contract
patterns into the existing Bun/TypeScript CLI and minimal template model.

Phases:

1. Phase 1: template/CLI boundary hardening.
2. Phase 2: `ActionSpec`, `ResultEnvelope`, and generated help/catalog.
3. Phase 3: `WorkbenchState` core with Markdown as projection.
4. Phase 4: bootstrap provenance, conflict, and drift audit.
5. Phase 5: security floor.
6. Phase 6: optional adapters, MCP catalog, and tool discovery only after core
   stability.

Adapted patterns:

- Registry/tool specs become CLI-kernel `ActionSpec` metadata and
  `ResultEnvelope` output/error contracts.
- Toolsets and capabilities become command groups and generated capability
  views from the registry.
- Approval and security guards become fail-closed noninteractive behavior,
  path/env/secret guardrails, denylist policy, and auditable bypasses.
- Skills guard becomes explicit scan/install/lock policy for skill material.
- MCP catalog becomes curated, late-bound, and explicitly enabled instead of a
  default surface.

Rejected non-goals:

- Raw CDP or browser control by default.
- Dangerous auto-approval in noninteractive mode.
- Lazy install or vendor marketplace behavior.
- Large gateway runtime or monorepo adoption.
- Progressive tool discovery before the command surface justifies it.

Minimum acceptance:

- CLI registry exposes command metadata as the canonical source.
- `ResultEnvelope` standardizes command output and errors.
- Workbench structured state is the source of truth; Markdown is projection.
- Bootstrap reports create/update/skip/preserve/conflict with ownership and
  provenance.
- Noninteractive dangerous operations fail closed.
- Template export remains free of factory-only runtime, scripts, and cache
  payloads.
- MCP/adapters remain deferred unless explicitly enabled and tested.

## 5) Feature Portfolio

### F-00 Total Reformulation Strategy

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0000_total-reformulation-strategy_spec_01.md
- Why: The project needs one coherent strategy before architecture, command
  design, and migration work begin.
- Exit criteria: manifesto exists; roadmap exists; feature specs exist;
  product/factory boundary is explicit; Bun/TS migration direction is explicit.
- Closure note: accepted strategy artifacts are
  `.afol/adm/doctrine/PROJECT-MANIFESTO.md`,
  `.afol/adm/roadmap/GENERAL-ROADMAP.md`, and the F-01 through F-17 parent
  specs. `docs/arc/**` remains the frozen transitional archive. The
  implementation closed through governed slices while preserving Python/Bash as
  the compatibility runtime until each command family earns native parity.

### F-01 Universal Agent CLI

- Status: final
- Governing spec: .afol/adm/specs/260521_0010_universal-agent-cli_spec_01.md
- Why: Logic should live in one updateable CLI instead of being copied into
  every project.
- Exit criteria: Bun/TypeScript CLI architecture is defined; CLI runs from
  `afol`; CLI reads local project state; CLI supports version lock and update
  checks; `afol` remains a compatibility alias until parity.
- Closure note: accepted implementation evidence is `E-20260528215311949499`
  and `E-20260528220141194181`; closeout session
  `.afol/wb/260528_0722_slice2-cli-kernel-front-door/`; strict verification
  passed.

### F-02 Minimal Project Template

- Status: final
- Governing spec: .afol/adm/specs/260521_0020_minimal-project-template_spec_01.md
- Why: Downstream projects need only the local state and minimal docs required
  for agents to operate.
- Exit criteria: src/project-template becomes minimal; template contains
  config, lock, manifest, rules, skills, workbench, and required docs; factory
  noise is excluded; bootstrap/export validates cleanliness.
- Closure note: accepted implementation evidence is
  `E-20260529135617802715`; closeout session
  `.afol/wb/260529_1350_f02-template-export-alignment/`; strict verification
  passed.

### F-03 Agent Command Design System

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0030_agent-command-design-system_spec_01.md
- Living residual:
  .afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md
- Sequential verification residual:
  .afol/adm/specs/260716_1234_agent-cli-sequential-verification-runs_spec-child_01.md
- Sequential residual state: implementation is complete on PR #46. The final
  residual is clean CI proof for the explicit governance timing-observation
  mode discovered by the closeout merge-candidate run.
- Why: Agents need extreme ease of use, extremely low latency, low
  **write-token** cost for CLI argv, low forced stdout, and very high
  reliability. Long commands and long default output train agents to waste
  model tokens; write tokens are worse than read tokens.
- Exit criteria (initial, done): short grammar exists; long aliases exist;
  high-frequency operations use 1-3 letter commands; compact output is default;
  JSON output is available.
- Residual exit criteria (child): agent docs/hints lead with active-session
  fast path (`st T-01`, `d T-01 -x "…"`, `c`); explicit `-S` path retained for
  CI/multi-agent; flag tables match live CLI; input argv + latency budgets
  validated; default agent commands stay under output token rules.
- Closure note: accepted implementation evidence is
  `E-20260529134101240986`; closeout session
  `.afol/wb/260529_1336_f03-kernel-grammar-alias-help/`; strict verification
  passed. The residual child is final on `E-20260715181045803-75a16e` in
  `.afol/wb/260715_1628_afol-1-0-agent-cli-residual/`; final-status session
  `260715_1811_afol-1-0-final-status` recorded the reconciled closure. Sequential
  verification remains active until its timing-gate follow-up passes both
  required PR #46 CI events.

### F-04 Governance Workbench System

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0040_governance-workbench-system_spec_01.md
- Why: Plans, tasks, evidence, logs, specs, and reports need a durable local
  execution model.
- Exit criteria: typed workbench model; command-managed
  plans/tasks/logs/evidence/reports/sidecars; evidence required for completion;
  closure validation catches drift.
- Closure note: accepted implementation evidence is `E-20260528084521802724`;
  closeout session `.afol/wb/260528_0833_f04-workbench-core-review-fix/`.
- Current close/report semantics were revalidated in
  `.afol/wb/260713_0716_close-waiver-summary-conflict/`; historical strict
  evidence does not replace current release-readiness gates.

### F-05 Smart Rules and Skills Routing

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0050_smart-rules-and-skills-routing_spec_01.md
- Why: Agents should receive only relevant rules and skills for the current
  work.
- Exit criteria: rule router; skill router; surface detection; compact
  delegation context; project-local updateable rules and skills.
- Closure note: accepted implementation evidence is `E-20260528100236370279`;
  closeout session `.afol/wb/260528_0956_f05-review-parity-strict/`.

### F-06 File-First Low-Token Execution

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0060_file-first-low-token-execution_spec_01.md
- Why: Agents should save detailed work into files and return compact handoffs
  instead of flooding context.
- Exit criteria: research save flow; log append flow; compact handoff format;
  summary plus paths; routine updates avoid manual file editing.
- Closure note: accepted implementation evidence is `E-20260528103543755917`;
  closeout session `.afol/wb/260528_1029_f06-review-fix/`.

### F-07 Local State Index and Event Log

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0070_local-state-index-and-event-log_spec_01.md
- Why: Agents should query compact state instead of repeatedly scanning raw
  files.
- Exit criteria: local indexes for workbench, rules, skills, specs, and files;
  event log records command and file activity; compact queries; optional watcher
  plan.
- Closure note: accepted implementation evidence is `E-20260528112023377690`;
  closeout session `.afol/wb/260528_1111_f07-local-state-review-fix/`.

### F-08 Safe File Mutation and Undo

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0080_safe-file-mutation-and-undo_spec_01.md
- Why: Agents need safe tools to move, patch, write, archive, and undo files.
- Exit criteria: mutation journal; session/task context; dry-run; undo where
  feasible; protected dangerous paths.
- Closure note: accepted implementation evidence is `E-20260528122615973830`;
  closeout session `.afol/wb/260528_1145_f08-safe-file-mutation-undo/`;
  board cleanup was accepted in `cb2e024`.

### F-09 Template Update and Versioning

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0090_template-update-and-versioning_spec_01.md
- Why: Downstream projects must receive updates when the core system improves.
- Exit criteria: project lock; managed manifest; update check; update preview;
  conflict detection; preserved local edits.
- Closure note: the parent spec is final and the accepted implementation
  evidence is `5a1811fe0a967fc8a89c2c78a2722d972e210700` and
  `6fc611a095cca821c9276aad5b29ecc1fbd3ea96`.

### F-10 Runtime Adapters and MCP

- Status: final
- Governing spec: .afol/adm/specs/260521_0100_runtime-adapters-and-mcp_spec_01.md
- Why: The system should support Codex, OpenCode, Claude Code, Gemini CLI,
  Qwen, and future runtimes.
- Exit criteria: thin adapters; MCP exposes safe tools; CLI and MCP share core
  logic; runtime-specific docs remain minimal.
- Closure note: accepted implementation evidence is
  `E-20260528134556147936`; closeout session
  `.afol/wb/260528_1343_runtime-adapters-and-mcp/`.

### F-11 Validation, CI, and Benchmarks

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md
- Why: The system needs trust gates before work is marked complete or releases
  are published.
- Closure note: the accepted F-11 closeout is complete. Accepted evidence is
  the session-backed contract layer
  `.afol/wb/260528_1409_f11-validation-benchmark-contract`, selector/matrix
  pack-map commits `3a6456e` and `afe8a79`, real typecheck gate `a1fa3e1`,
  routing-accuracy `7760358`, update-safety `681c6d0`, and mutation-safety
  `8dd5e20`.
  Artifact-backed benchmark result persistence for the selected pack set is
  captured under `.afol/data/benchmarks/results/20260529_14263*_*.json`
  (one JSON per pack), with explicit waiver evidence for
  `runtime-live-agent` in
  `.afol/data/benchmarks/results/20260529_142633_runtime-live-agent.json`
  (`status=skipped`, `all-scenarios-skipped:not-implemented-live-runner`).
- Clean-checkout release evidence for historical product commit `af160f8` is
  retained in `.afol/wb/260713_0733_final-observed-release/`. Current evidence
  for product commit `81a3a34` is retained in
  `.afol/wb/260713_0753_documentation-and-template-freshness/` with the
  `validate-release-clean.log` artifact. Observed short-path benchmark evidence
  is retained in
  `.afol/wb/260713_0724_final-observed-workbench-benchmark/`.
- Exit criteria: type checks; unit tests; schema tests; command parity tests;
  template export tests; workbench validation; MCP parity tests; benchmark
  packs for accuracy, speed, safety, quality, and token cost on risky changes.

### F-12 Public Distribution and Onboarding

- Status: final
- Governing spec:
  .afol/adm/specs/260521_0120_public-distribution-and-onboarding_spec_01.md
- Why: The system should eventually be usable by other people.
- Exit criteria: public install path; simple first-run onboarding; minimal
  docs; examples; private assumptions removed; standalone binary smoke and
  reproducible install gates pass before any public release claim.
- Closure note: accepted implementation evidence is
  `E-20260528144544308053`; closeout session
  `.afol/wb/260528_1444_public-distribution-and-onboarding/`.

### F-13 Agentic Runtime Restructure

- Status: final
- Governing spec:
  .afol/adm/specs/260411_agentic-runtime-restructure_spec_01.md
- Why: Runtime command/help surfaces, MCP parity, and tool catalog alignment
  must remain consistent while runtime code is restructured.
- Closure note: the parent spec is final and the accepted native-port slices
  are final: tool catalog parity, status, session catchup, knowledge pull,
  knowledge list/search/show, and knowledge index.
- Exit criteria: runtime source-of-truth drives command/help parity; MCP smoke
  and parity checks stay green; tool catalog/docs align with real gates and
  command surface.

### F-14 Spec-Child And Spec-Test Governance

- Status: final
- Governing spec:
  .afol/adm/specs/260412_1110_spec-child-and-spec-test-governance_spec_01.md
- Why: Child-spec naming, spec-test strategy docs, and legacy spec-lite
  compatibility need a clear governance anchor before any executable follow-up.
- Exit criteria: spec-child is documented as the canonical child/local spec
  artifact; spec-test is documented as the pre-test strategy artifact;
  spec-lite remains a legacy compatibility alias; the F-14 folder convention
  `.afol/adm/specs/F-14/spec-tests/` is explicit.
- Closure note: accepted governance evidence is
  `E-20260528153442093351`; verified outcome summarized in
  `.afol/wb/260528_1528_spec-child-and-spec-test-governance/`
  and its final report.

### F-15 Repo-Wide Simplification Runtime Parity

- Status: final
- Governing spec:
  .afol/adm/specs/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md
- Why: bounded simplification slices reduced runtime/script complexity and
  map drift without changing the public CLI behavior.
- Closure note: accepted child slices are final in `.afol/adm/specs/INDEX.md`:
  scripts cleanup, map boundary cleanup, runtime registry parity, and python
  command simplification.
- Exit criteria: satisfied; strict governed evidence exists for the accepted
  slices and the current-state docs are reconciled.

### F-16 Export Contract Hardening

- Status: final
- Governing spec:
  .afol/adm/specs/260413_1250_project-template-source-separation_spec_01.md
- Why: enforce a strict export contract so bootstrap/export dry-run copies only
  sanctioned `src/project-template` content and keeps history/noise out.
- Closure note: accepted implementation evidence `b520f23` and `75cf349` is
  complete; `.afol/adm/specs/INDEX.md` now marks the parent spec as `final` and
  the current-state map docs reflect the closeout.
- Exit criteria: satisfied; the accepted export-contract and source-root helper
  slices are complete and the docs/governance surfaces are reconciled.

### F-17 Just Command Runner Migration

- Status: final
- Governing spec:
  .afol/adm/specs/260413_1849_just-command-runner-migration_spec_01.md
- Why: retire `just` from the documented downstream path while preserving
  factory-only compatibility long enough to prove command parity and predictable
  validation behavior.
- Closure note: the parent spec is final and the accepted child slices are
  final.
- Exit criteria: aggregate validation entrypoints and standards mirrors stay in
  command parity; governed slices close with strict evidence.

### F-18 Rehome Administration and Project Structure

- Status: final
- Governing spec:
  .afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md
- Why: AFOL needs a stable onion architecture and source-boundary model before
  adding SQLite hydration, memory, library, context bundles, and spec gates.
  Project direction now lives in `.afol/adm/**`, and current project-structure
  maps live under `.afol/pstr/**`.
- Relationship to prior features: F-18 extends the final F-04 workbench, F-05
  routing, F-06 file-first handoff, F-07 local-state contracts, and the draft
  F-18 operational-state specs. It supersedes the narrow JSON-source direction
  with Markdown/YAML canonical administration plus SQLite materialization.
- Exit criteria:
  - Project manifesto names AFOL as a layered local execution OS for agents.
  - `.afol/adm/**` is specified as target project administration for roadmap,
    specs, ADRs, changelog, archive, and doctrine.
  - `.afol/pstr/**` is specified as target project structure for current-state
    maps only.
  - `docs/arc/**` is the frozen transitional archive; ADR-005 records the
    authority transfer to `.afol/adm/**`.
  - Onion layers define doctrine, authority, contracts, hydration/projection,
    domain services, providers, CLI commands, and runtime adapters.
  - Memory and library boundaries are explicit and separate.
  - SQLite is specified as rebuildable materialized execution state, not the
    only human-readable source.
  - Legacy `.agents/agents`, `.agents/scripts`, `.agents/runtime`,
    `.agents/wb`, `.agents/z-arq`, `agents.config`, and legacy delegate routing
    remain prohibited.
- Closure note: accepted implementation evidence is commits `282f116`,
  `6791aca`, `f2e328f`, and `78bf2a1`. F-18 delivered AFOL-only PSTR maps,
  drift checks, SQLite hydration and `db health`, memory proposal/recall flows,
  library claims, context bundles with trusted fail-closed mode and retrieval
  modes, spec gate checks integrated into `done --require-spec-check`, ADR and
  changelog commands, health/doctor/maintenance, schema/resolver, and sweep
  commands. `.afol/adm/**` is canonical administration for this repository;
  `docs/arc/**` is the frozen transitional archive for schema and resolver
  history.

#### F-18.S1 PSTR Map System

- Status: final
- Governing spec:
  .afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md
- Why: Agents need a compact structural map of the current project before they
  scan broadly or edit code.
- Exit criteria:
  - PSTR map schema exists with `doc_type`, `scope`, `authority: observed`,
    source paths, source hash, updated timestamp, tags, and freshness status.
  - Area maps are defined for the areas that exist in a project: frontend,
    backend, API, data, devops, CLI, integrations, flows, tests, and critical
    paths.
  - `.afol/pstr/**` contains maps only, not scripts, task state, automations,
    roadmap/spec governance, or future-state planning.
  - `afol pstr rebuild`, `afol pstr show`, `afol pstr section`,
    `afol pstr validate`, and `afol pstr stale` are specified as CLI commands
    whose outputs live in `.afol/pstr/**`.
  - Context bundles include compact `pstr_refs` instead of loading the whole
    pstr tree.

#### F-18.S2 ADM/PSTR Drift Validation

- Status: final
- Governing spec:
  .afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md
- Why: AFOL must compare desired state in adm/specs with observed structure in
  pstr maps without confusing maps for authority.
- Exit criteria:
  - Drift checks detect stale pstr maps, missing implementation, contradiction
    between desired-state docs and observed maps, and unimplemented spec
    expectations.
  - Drift reports are compact, JSON-capable, and include next-step hints for
    agents.
  - Source code remains the final authority for current implementation state.
  - PSTR drift findings do not automatically become roadmap or task decisions.

#### F-18.S3 SQLite Hydration Layer

- Status: final
- Governing spec:
  .afol/adm/specs/260612_agent-operational-state-context-library_spec_01.md
- Why: AFOL needs fast local execution state, FTS, source hashes, and bundle
  generation without making JSON files or SQLite the human authoring surface.
- Exit criteria:
  - SQLite v1 materializes workbench sessions, task rows, source hashes, and
    evidence.
  - Adm, pstr, memory, library, events, sections, tools, and context bundle
    state remain file-backed unless and until a State DB v2 feature implements
    their tables and migrations.
  - SQLite is rebuildable from canonical Markdown/YAML/evidence sources.
  - JSON output remains command/export/debug format, not a live competing
    source of truth.

#### F-18.S4 Project Memory System

- Status: final
- Governing spec:
  .afol/adm/specs/260612_agent-operational-state-context-library_spec_01.md
- Why: AFOL needs compact long-lived project continuity without turning memory
  into raw research, chat transcript, or hidden prompt state.
- Exit criteria:
  - `.afol/memory/memory.md` is the concise memory master.
  - Memory proposal, promotion, rejection, invalidation, archive, render, and
    recall flows are defined.
  - Memory can feed context bundles selectively.
  - Memory links to library when needed but does not store external research.

#### F-18.S5 Library Markdown Graph

- Status: final
- Governing spec:
  .afol/adm/specs/260612_global-project-research-library_spec-child_01.md
- Why: AFOL needs curated external knowledge with sources, claims, freshness,
  invalidation, tags, wikilinks, and optional IWE-powered retrieval.
- Exit criteria:
  - `.afol/library/**` uses Markdown/YAML library documents.
  - Sources include provenance and `accessed_at`.
  - Claims are supported by sources and can be invalidated without deletion.
  - IWE is a provider behind AFOL library policy, not a core authority.

#### F-18.S6 Context Bundle and Tool Routing

- Status: final
- Governing spec:
  .afol/adm/specs/260612_context-routing-bundles-and-section-index_spec-child_01.md
- Why: Agents need the smallest correct task/role context: adm refs, pstr refs,
  tools, rules, skills, memory, library, validation, and `do_not_load`.
- Exit criteria:
  - `afol ctx bundle` returns compact JSON for one task/role/surface.
  - Bundles include refs by default and expand sections only on demand.
  - Bundle budgets prevent adm, pstr, memory, or library from becoming repo
    dumps.
  - `ctx explain` makes routing decisions auditable.

#### F-18.S7 Spec Gate, Cleanup, and Governance

- Status: final
- Governing spec:
  .afol/adm/specs/260612_spec-compatibility-and-decision-history_spec-child_01.md
- Why: AFOL needs closure gates, explicit waivers, cleanup/audit flows, ADRs,
  changelog, and archive behavior that preserve history without polluting active
  surfaces.
- Exit criteria:
  - `afol spec check` can block `done`/`close` when required checks are missing
    or conflicted.
  - Waivers require explicit reason and decision/spec reference when relevant.
  - ADR/changelog/archive commands preserve superseded, abandoned, and archived
    decisions.

#### F-18.S8 Temporal Health, Freshness, and Token Budgets

- Status: final
- Governing spec:
  .afol/adm/specs/260612_temporal-health-freshness-token-budget_spec-child_01.md
- Why: AFOL must age well over months of use; stale pstr maps, stale memory,
  stale library claims, stale SQLite state, oversized bundles, and unrotated
  logs must be visible before agents trust them.
- Exit criteria:
  - Durable artifacts carry timestamps, status, authority, source hash, and
    branch/commit metadata where relevant.
  - `afol health` is fast by default and reports `fail`, `warn`, and `info`.
  - `afol health --area adm|pstr|wb|memory|library|state|ctx|token_budget`
    is the canonical domain health surface.
  - `afol pstr stale` blocks stale maps from trusted context bundles.
  - State health checks schema, migrations, source hashes, FTS freshness,
    orphan records, and size/WAL signals.
  - Maintenance commands produce dry-run cleanup reports for weekly and monthly
    routines, including memory/library review, workbench archive candidates,
    roadmap/spec/manifest alignment, and rule/skill pruning warnings.
  - Context bundles enforce explicit token budgets and prefer refs before full
    documents.

#### F-18.S9 AFOL Brain Shape, Think-Lite, and Trust Boundary

- Status: final
- Governing spec:
  .afol/adm/specs/260612_afol-brain-shape-retrieval-doctor-trust_spec-child_01.md
- Why: AFOL should gain a small internal brain layer without copying a heavy
  always-on brain product: typed source classes, shape packs, graph-aware
  retrieval, gap analysis, resolver routing, sweep/doctor cycles, and operation
  trust boundaries.
- Exit criteria:
  - `.afol/adm/schema/afol-shape.yaml` defines source classes, page types,
    authority, inclusion rules, freshness policy, and cache-key versioning.
  - `afol schema detect/suggest/review/apply` is specified for pstr and library
    shape evolution with human review.
  - `afol ctx bundle --explain` returns context, why, gaps, freshness,
    evidence tags, create-safety hints, and do-not-load.
  - Retrieval combines exact/path/id match, SQLite FTS, section index,
    wikilinks/backlinks, pstr structural refs, freshness, authority, and
    lightweight reranking.
  - `afol sweep daily|weekly|monthly` is specified as command-run maintenance,
    not a mandatory daemon.
  - `afol doctor --remediation-plan` produces ordered repair steps with domain
    scores.
  - OperationContext distinguishes local, agent, and remote callers and applies
    stricter mutation rules for lower-trust contexts.

#### F-18.S10 Memory and Library Adoption Loop

- Status: active
- Governing specs:
  .afol/adm/specs/260612_agent-operational-state-context-library_spec_01.md
  and
  .afol/adm/specs/260612_global-project-research-library_spec-child_01.md
  and
  .afol/adm/specs/260716_2155_f18-s10-memory-library-adoption-loop_spec-child_01.md
- Why: health-green memory/library systems can still remain empty after real
  project work when agents never run the explicit proposal/promotion flows.
  Empty stores are valid when there is no reusable material, but AFOL should
  distinguish "nothing worth retaining" from "workflow never asked".
- Current gap: AFOL exposes manual memory and library proposal/promotion
  primitives, while healthy empty stores remain valid. Those primitives and a
  green health result do not satisfy this slice because no session-to-candidate
  adoption path exists yet.
- Evolution boundary: implement this direction as a planned, read-only AFOL
  Evolution candidate-review slice. It may inspect completed project artifacts
  and emit `adoption_candidate` records with source/session provenance, but it
  must not promote, mutate, or auto-ingest canonical knowledge.
- Governance gate: the dedicated F-18.S10 child spec is approved and
  cross-references the AFOL Evolution governance; implementation remains
  planned until its bounded slice is authorized. The approved governance
  parent is F-30 and its dedicated spec is
  `.afol/adm/specs/260716_2155_afol-evolution-system_spec_01.md`.
  The current final specs define the memory/library primitives, not the missing
  adoption integration.
- Scope:
  - Add a compact post-session or maintenance review path that inspects
    workbench reports, evidence, lessons, decisions, and sourced research for
    memory/library candidates.
  - Produce reviewable candidates only; promotion stays explicit and
    human-auditable through the existing proposal/promotion mutation paths.
  - Keep memory for durable project continuity and library for sourced claims;
    do not merge them into hidden prompt memory, raw transcript storage, or
    automatic research ingest.
  - Ensure context bundles consume only promoted, current memory/library refs.
- Exit criteria:
  - After governed work, an operator can run one compact command to see whether
    memory or library candidates exist for the session.
  - Useful decisions, repeated corrections, continuity notes, and project
    operating preferences can become memory proposals with explicit ids, tags,
    provenance, and review status.
  - Sourced research can become library draft/proposal material only when
    claims have sources, purpose, provenance, and freshness metadata.
  - Health or maintenance output can report "unused/adoption gap" separately
    from broken schema, stale state, unsupported claims, or missing sources.
  - Empty memory/library state remains acceptable when the review finds no
    reusable candidates.

Follow-on slices under this direction:

- Implement each feature above as narrow slices.
- Immediate adoption gap: Memory and Library Adoption Loop v1. Connect
  completed workbench or maintenance artifacts to read-only candidate discovery
  so real project usage can feed reviewed memory/library proposals instead of
  leaving those stores empty by default. The child spec is active and
  implementation is planned under F-30; promotion remains explicit.
- Immediate next slice: Temporal Reliability v1. Implement explicit path
  config, `afol pstr stale --json`, trusted-context stale gates,
  `afol health --area state|library|memory`, weekly/monthly maintenance dry-run
  reports, scaffolded AFOL maintenance skills, and live-agent maintenance
  cadence benchmark coverage.
- Defer daemon behavior, embeddings, physical archive moves, aggressive
  auto-ingest, full graph expansion, and remote schema/admin mutation.
- Do not combine SQLite, memory, library, context bundle, spec gate, temporal
  health, brain-shape retrieval, and cleanup implementation in one PR.

### F-19 Canonical AFOL Configuration Rehome

- Status: final
- Governing spec:
  .afol/adm/specs/260627_1655_canonical-afol-configuration-rehome_spec_01.md
- Why: AFOL operational configuration should be owned by AFOL, not by the
  provider-facing `.agents/` metadata surface. The current `.agents/config.json`
  location still acts as root-detection and path-resolution input, which keeps
  an AFOL-owned contract in the provider metadata layer.
- Scope:
  - Make `.afol/config.json` the canonical AFOL config file.
  - Keep a temporary read-only compatibility fallback for existing
    `.agents/config.json` installs.
  - Keep project-local provider skills under the configured `paths.skills_dir`;
    do not use this change to move `.agents/skills/**` or create
    `.afol/skills/**`.
  - Reassess `.agents/lock.json` and `.agents/manifest.json` separately because
    update ownership and managed hashes depend on them.
- Exit criteria:
  - Project root detection prefers `.afol/config.json` and reports that path in
    status/diagnostics.
  - Path resolution, validation, rule/hook catalogs, adapters, bootstrap, and
    update flows read config through one shared resolver.
  - `src/project-template` exports `.afol/config.json` for new installs.
  - Existing installs with only `.agents/config.json` continue to load through a
    documented compatibility path until an explicit migration removes it.
  - Docs and template guidance no longer describe `.agents/config.json` as the
    canonical AFOL config surface.
- Validation targets:
  - `bun test cli/tests/project-root.test.ts cli/tests/validate-command.test.ts cli/tests/bootstrap.test.ts`
  - `bun run template:check`
  - `bun run typecheck`
  - `afol validate project`
- Closure evidence: implemented in session
  `260627_1824_open-spec-completion`; validated with `bun test`,
  `bun run typecheck`, `afol validate project --json`, `afol v bench --pack
  update-safety --json`, template generation, and security release scan.
- Risks:
  - Moving root detection without fallback can make existing projects invisible
    to `afol`.
  - Updating template payloads without manifest/update alignment can create
    false conflicts in downstream update flows.
  - Combining config rehome with skills rehome would blur provider metadata and
    AFOL runtime ownership; keep those decisions separate.

### F-20 Parallel Session Isolation

- Status: final
- Governing spec:
  .afol/adm/specs/260426_1215_parallel-session-isolation_spec_01.md
- Why: concurrent local, remote, and CI agents need isolated workbench session
  context. A single mutable global active-session pointer is unsafe when
  several agents produce plans, tasks, evidence, and reviews in parallel.
- Scope:
  - Prefer explicit `--session` targeting for governed work.
  - Support context-local session binding for local and remote agents.
  - Reject unsafe global active-session fallback in CI and other parallel
    contexts.
  - Warn when a PR or remote agent mutates `.afol/wb/.active_session` without
    an explicit session-management intent.
- Exit criteria:
  - Session resolution follows explicit flag, `AFOL_SESSION`, context-local
    binding, then guarded global fallback.
  - `afol session list|bind|switch|unbind` supports operator control over
    session context.
  - Validation flags accidental `.active_session` drift and keeps remote-agent
    reviews from corrupting local workbench state.
- Validation targets:
  - `afol validate project`
  - `afol validate bench --pack workbench-parity --json`
  - `bun test cli/tests/session*.test.ts cli/tests/workbench*.test.ts`
- Risks:
  - Overly strict fallback removal can make quick local commands noisy.
  - Under-strict fallback can let remote/CI agents mutate the wrong session.
  - Session binding must remain visible and reversible for operators.

### F-21 TypeScript 7 Toolchain Adoption

- Status: final
- Governing spec:
  .afol/adm/specs/260710_1256_typescript-7-toolchain-adoption_spec_01.md
- Why: the repository already uses a blocking local typecheck, but its
  `typecheck:ts7:informative` lane hides compiler failures and resolves
  `typescript@next`, which now tracks TypeScript 7.1 nightlies instead of the
  stable TypeScript 7 release. Adopting an exact stable compiler makes the
  release contract deterministic and removes a false-positive validation path.
- Scope:
  - Pin the local development compiler to exact TypeScript `7.0.2` and update
    the Bun lockfile without changing Bun runtime or bundling behavior.
  - Remove the masked informative TS7 lane.
  - Keep `bun run typecheck` as a standalone release preflight and a blocking CI
    step after dependency installation and before release validation.
  - Add a focused CI contract test for that ordering and blocking behavior.
  - Preserve the current `tsconfig.json` unless the stable compiler proves that
    a configuration change is required.
- Exit criteria:
  - `package.json` and `bun.lock` resolve exact TypeScript `7.0.2`.
  - No script catches or converts TypeScript compiler failures into success.
  - CI installs from the frozen lockfile, runs the blocking typecheck, and only
    then enters release validation.
  - Focused toolchain tests, the full test suite, build, clean smoke, AFOL
    validation, and required security scans pass.
- Validation targets:
  - `bun install --frozen-lockfile`
  - `bun run typecheck`
  - `bunx tsc --noEmit -p tsconfig.json --skipLibCheck false`
  - `bun test cli/tests/release-toolchain.test.ts cli/tests/validate-internals.test.ts`
  - `bun test`
  - `bun run build`
  - `bun run validate:release`
  - `bun run smoke:clean`
  - `afol local-state rebuild --json`
  - `afol validate project --json`
  - `bun run validate:security:required`
- Rollback:
  - Restore the local compiler to exact TypeScript `6.0.3` and regenerate only
    the dependency lockfile.
  - Keep the blocking typecheck and CI contract test.
  - Do not restore the masked informative lane.
- Risks:
  - TypeScript 7 has no stable programmatic compiler API; AFOL must continue to
    avoid compiler API dependencies until a later version provides one.
  - Faster typechecking does not improve Bun runtime or standalone binary
    performance because Bun remains the runtime, transpiler, and bundler.
  - Editor `tsgo` activation is a separate host configuration change and is not
    part of this repository feature.

### F-22 Core Integrity and Transaction Safety

- Status: final
- Governing spec:
  .afol/adm/specs/260710_core-integrity-and-transaction-safety_spec_01.md
- Why: AFOL must fail closed when agents complete tasks, mutate shared files,
  update scaffolds, bootstrap projects, or resolve governance. Current gaps can
  admit declared-only completion, stale concurrent writes, destructive undo,
  partial commits, and nominal governance bindings.
- Scope:
  - Enforce a formal task-state transition model and authorize completion only
    through observed successful execution or an explicit typed artifact or
    waiver policy.
  - Serialize shared-resource mutation by canonical path, revalidate hashes at
    commit time, make journal state auditable, and block destructive undo on
    drift, missing backups, duplicate undo, or journal corruption.
  - Replan scaffold updates inside one global lock, preserve project-owned
    content, constrain stale-path removal by ownership and hash, and support
    guarded rollback by update batch.
  - Make bootstrap/init approval-gated, target-locked, staged, and recoverable.
  - Validate real roadmap feature/spec bindings and protect governance,
    pending-spec, session-context, hydration, and verification state against
    partial failure or silent corruption.
  - Require explicit safe inputs for quick tasks and produce consistent JSON
    errors and collision-resistant cross-process identifiers.
- Exit criteria:
  - An executable task cannot reach `done` from declared-only evidence, stale
    evidence, `n/a`, or an illegal prior state; the result identifies the
    evidence or typed policy that authorized completion.
  - Concurrent processes cannot lose a file mutation or scaffold update because
    locks and hash preconditions cover the actual shared resources.
  - Mutation, undo, update, bootstrap, governance, and session-context flows
    either commit coherently or return a structured recoverable failure without
    destroying newer state.
  - Governance resolution proves that feature and active parent spec exist and
    are linked; pending governance blocks the affected session at `start`, not
    unrelated future work.
  - Corrupt journal, workbench, evidence, or materialization inputs are reported
    as integrity failures instead of being silently skipped or classified as
    closed/fresh.
  - Focused multi-process concurrency, fault-injection, lifecycle, update,
    bootstrap, state hydration, strict verification, typecheck, full tests,
    release validation, and required security scans pass.
- Closure note: the implemented integrity boundary was revalidated with
  `E-20260715181107664-d5ef13` in
  `.afol/wb/260715_1628_afol-1-0-integrity-closeout/`; full tests reported
  `1203/0` and final-status session `260715_1811_afol-1-0-final-status`
  reconciled the parent closure. The two pre-existing C01 child specs remain
  separately governed and are not reopened by this parent closeout.
- Delivery phases:
  1. Lifecycle transitions and completion authorization.
  2. Resource locks, hash preconditions, mutation transactions, and safe undo.
  3. Update locking, internal replan, ownership safety, and batch rollback.
  4. Bootstrap approval, staging, target locking, and rollback.
  5. Governance validation and transactional state integrity.
  6. Quick-task, hydration, verifier, JSON error, and identifier hardening.
- Risks:
  - Tightening completion can expose historical evidence that never met the new
    policy; compatibility must remain explicit and must not weaken new writes.
  - Cross-cutting transaction work can become a framework rewrite; delivery
    should share only the smallest proven lock, hash, journal, and rollback
    primitives.
  - Locks without deterministic ordering can deadlock; multi-resource locks
    must use canonical paths and stable ordering.

### F-29 AFOL 1.0 Linux/WSL Finalization and Local Diagnostics

- Status: final
- Governing spec:
  .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
- Why: AFOL 1.0 needs one collision-safe, Linux/WSL-scoped finalization lane
  that makes local diagnostics, governance drift, release provenance, and
  observed standalone behavior explicit without reopening reserved features or
  restoring retired runtime surfaces.
- Child spec policy:
  - Required: yes
  - Child specs:
    - .afol/adm/specs/260715_afol-1-0-local-diagnostics_spec-child_01.md
    - .afol/adm/specs/260715_afol-1-0-linux-wsl-release-hardening_spec-child_01.md
- Scope:
  - Reconcile specs index rows and frontmatter through blocking drift checks.
  - Add offline local diagnostics and integrity evidence while preserving
    `afol.result/v1` and existing error output contracts.
  - Prove Linux x64 and observed WSL2 release behavior with bounded,
    redacted, file-backed evidence.
- Out of scope:
  - Windows, macOS, ARM, MCP, remote feedback, network sync, and result/v2.
  - F-12 reopening, F-23 through F-28 reservation, global installation,
    deployment, or restoration of discontinued `.agents` runtime surfaces.
- Exit criteria:
  - Parent and child specs are linked from this roadmap and pass frontmatter /
    index drift validation.
  - Local diagnostics remain offline, redacted before persistence, bounded
    under contention, and opt-in by mode.
  - Linux x64 build/provenance and observed WSL2 smoke evidence are current,
    reproducible, and recorded without claiming unsupported platforms.
  - Focused tests, project validation, release gates, and required security
    scans pass; unresolved failures remain visible blockers.
- Closure note: final-status session `260715_1811_afol-1-0-final-status`
  accepted diagnostics evidence `E-20260715172724325-99e5fa`, F-29 release
  command evidence `E-20260715180931454-766e6a` plus observed artifact
  authorization `E-20260715181030468-8dd8d9`, and the cross-feature full-test
  result `1203/0`. `validate:release` exited 0 at HEAD `6210ac8`; unsupported
  platforms, global install, deployment, and remote CI remain unclaimed.
- PR review remediation: session `260715_1956_pr-40-review-remediation`
  closed with five tasks complete, focused regressions, full suite `1212/0`,
  release/security evidence, and observed release provenance
  `E-20260715203240273-ae29f0`.
- Follow-up argv remediation: session
  `260715_2048_pr-40-argv-delimiter-remediation` closed with two tasks complete,
  full-suite evidence `E-20260715205427257-47985c`, and independent review.
- Template index remediation: session
  `260715_2109_pr-40-template-spec-index-remediation` closed with two tasks
  complete, full-suite evidence `E-20260715211444533-1df252`, and independent
  downstream scaffold review.

### F-30 AFOL Evolution System

- Status: active
- Governing spec:
  .afol/adm/specs/260716_2155_afol-evolution-system_spec_01.md
- Why: AFOL needs a controlled learning loop that connects native and
  explicitly imported session evidence, user decisions, recurring friction,
  production-day metrics, and later evaluation without silently changing
  critical project behavior.
- Relationship to prior features: F-30 consumes the workbench, evidence,
  telemetry, maintenance, memory, library, context, and Universal Skills
  surfaces delivered by F-04, F-07, F-18, and F-29. It is the governance
  parent for the F-18.S10 adoption loop and must not create a parallel
  canonical knowledge store.
- Core contract: `Observer -> Analyst -> Proposal -> Critic -> User/Policy ->
  Apply -> Evaluate`. Observation and derived counters may be automatic;
  critical surfaces remain approval-gated and every proposal must retain
  evidence, risk, validation, and evaluation references.
- Product modes:
  - one short, report-first daily suggestion per project on the first session
    of the local calendar date, with shared receipts across harnesses;
  - intentional, read-only analysis and preview through `afol evolve`, with
    application only through the normal AFOL workbench lifecycle.
- Scope includes production-day ledger, preference evidence with temporal
  decay, deterministic recurrence detection, scorecards, suggestion receipts,
  proposal/evaluation/canary state, explicit external-session imports,
  normalization/redaction/linking, low-risk undoable lessons/memory updates,
  and maintenance of derived evolution state.
- Autonomy boundary: no daemon, silent provider reads, cloud chat sync,
  automatic rule/skill/config/spec/ADR/roadmap/code changes, global preference
  promotion, merge, or automatic research generation in the first release.
- Planned child slices:
  0. Governance, schemas, threat model, UX journey, metrics, and canonical vs
     derived-state boundary.
  1. Evolution config, project identity, migrations, health, and production-day
     ledger.
  2. Preference evidence, precedence, confidence, and 7/20 production-day
     degradation.
  3. Observation normalization, fingerprints, recurrence clusters, and
     comparable-task scorecards.
  4. Daily suggestion queue, project/day deduplication, TTL claims, skip,
     reject, reminders, and critical-alert separation.
  5. Intentional `afol evolve` analysis/status/proposal/review flow.
  6. Explicit Codex and Pi imports first, then additional versioned adapters;
     streaming, resumability, redaction, idempotency, linking, and hostile
     transcript boundaries.
  7. Bounded low-risk lessons/memory application with canonical mutation
     journal, undo, validation, and initial first-release
     `auto_apply_mode: canary`; `none` remains selectable and promotion to
     `lessons_memory_only` requires successful evaluation plus explicit
     policy/configuration approval.
  8. Comparable-session evaluation, canary, stabilization, reopening, and
     rollback.
  9. Universal Skills integration for read-only `good-morning` and
     session-retro consumption, without moving evolution logic into skills.
- Acceptance direction: every suggestion/proposal is traceable to source
  evidence; daily dedupe is concurrency-safe; skipped work can be reprioritized;
  explicit rejection suppresses recurrence until material evidence changes;
  preferences age by production ordinals; imports are explicit, redacted,
  idempotent, resumable, and fail closed; critical knowledge surfaces are
  never silently mutated; and improvements are accepted only when quality,
  integrity, and user-load metrics do not regress.
- Delivery policy: implement in independent PRs by child slice. The first
  slice must remain schema/governance-only, with no LLM call, external
  import, automatic application, or daemon. Do not combine F-30 slices with
  SQLite, memory, library, context, or maintenance rewrites.

#### F-30 Agent Submission and Batch Review

- Status: active
- Governing spec:
  .afol/adm/specs/260717_agent-submission-and-batch-review_spec_01.md
- Intent: explore a bounded one-worker submission and review workflow that may
  reduce lifecycle round trips while preserving AFOL's existing authority and
  evidence boundaries.
- Architectural decision:
  .afol/adm/decisions/ADR-007-agent-submission-review-boundary.md
- No public `dispatch`, `submit`, or F-30 benchmark pack exists in the current
  registry. These names remain design vocabulary only until an implementation
  slice is approved and shipped.
- Backlog acceptance requires a governing child spec, registered commands and
  scenarios, deterministic authority/integrity tests, and fresh observed
  evidence. Planned intent is not production proof.

## 6) Recommended Delivery Phases

1. Strategy and design: manifesto, roadmap, specs, architecture, command
   system, product/factory boundary, compatibility constraints.
1. CLI kernel: Bun/TypeScript skeleton, `afol`, project detection, config/lock
   reading, short router, compact output, and AFOL-native command execution.
1. Workbench core: session, task state, evidence, log append, plan status,
   verify, close.
1. Rules and skills: routers, surface detection, delegation context, update
   model.
1. File intelligence: indexes, state query, event log, optional watcher,
   research/log save flows.
1. Safe mutation: write/move/patch/archive, mutation journal, dry-run, undo.
1. Update system: manifest, lock, check, preview, apply, conflicts.
1. Public readiness: install path, minimal docs, examples, CI, release workflow.

## 7) MVP

The MVP should include `afol`, Bun/TypeScript CLI, config and lock, short
command grammar, status, new, task start/done, evidence add, log add, verify,
close, rule resolve, skill list/update, template update check, and minimal
validation.

The MVP should not include full autonomous orchestration, complex UI, cloud
sync, full watcher daemon, large docs, public package polish, or complete
migration from every legacy script.

## 8) Core Metrics

Optimize for fewer file reads per agent task, fewer manual file writes, fewer
repeated rule loads, fewer task-state mistakes, fewer closure-without-evidence
cases, lower average command token cost, faster session resume, safer
downstream updates, higher command parity, better routing accuracy, and
measurable benchmark quality.

## 9) Risks

- Too many features before the CLI kernel works.
- Docs becoming bigger than the operating system.
- Commands becoming too short to understand.
- Global CLI making projects non-reproducible.
- Template becoming bloated.
- Update flow overwriting local project edits.
- Rules router delivering the wrong rules.
- Agents trusting indexes after stale state.
- Rewriting proven Python/uv behavior before Bun/TypeScript parity exists.

## 10) Strategic Guardrail

Every new feature must pass this test: does this reduce token cost, reduce agent
friction, prevent a repeated error, or improve updateability?

If not, it should not be added.
