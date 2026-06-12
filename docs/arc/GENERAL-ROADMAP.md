---
doc_type: roadmap
id: 260521_0000_total_reformulation_roadmap_01
status: active
owners:
- orchestrator
created_at: '2026-05-21T00:00:00+08:00'
updated_at: '2026-05-29T14:59:24Z'
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

1. Low-token command execution.
2. Minimal local template.
3. Bun/TypeScript as the system core.
4. Smart routing of rules and skills.
5. File-first, chat-light handoffs.
6. Safe file operations with mutation tracking.
7. Updateable downstream project installations.
8. Strong validation and closure gates.
9. Future public distribution.

## 4) Current-State Reconciliation

This repository already has useful Python, Bash, uv, Just, workbench, MCP, safe
mutation, and validation behavior. That behavior is compatibility contract, not
disposable history.

The Bun/TypeScript reformulation must be staged:

1. Keep `afol` as the project-local and downstream front door.
2. Keep legacy `.agents/agents`, Python, Bash, uv, and just surfaces
   factory-only until parity tests prove safe retirement.
3. Implement one typed Bun/TypeScript command family at a time.
4. Keep Python/Bash paths until parity tests prove the replacement.
5. Shrink src/project-template only after bootstrap/export validation proves
   downstream installs still work.

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
  docs/arc/SPECS/260521_0000_total-reformulation-strategy_spec_01.md
- Why: The project needs one coherent strategy before architecture, command
  design, and migration work begin.
- Exit criteria: manifesto exists; roadmap exists; feature specs exist;
  product/factory boundary is explicit; Bun/TS migration direction is explicit.
- Closure note: accepted strategy artifacts are
  `docs/arc/PROJECT-MANIFESTO.md`,
  `docs/arc/GENERAL-ROADMAP.md`, and the F-01 through F-17 parent specs. The
  implementation closed through governed slices while preserving Python/Bash as
  the compatibility runtime until each command family earns native parity.

### F-01 Universal Agent CLI

- Status: final
- Governing spec: docs/arc/SPECS/260521_0010_universal-agent-cli_spec_01.md
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
- Governing spec: docs/arc/SPECS/260521_0020_minimal-project-template_spec_01.md
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
  docs/arc/SPECS/260521_0030_agent-command-design-system_spec_01.md
- Why: Agents should use short, predictable commands to reduce repeated token
  cost.
- Exit criteria: short grammar exists; long aliases exist; high-frequency
  operations use 1-3 letter commands; compact output is default; JSON output is
  available.
- Closure note: accepted implementation evidence is
  `E-20260529134101240986`; closeout session
  `.afol/wb/260529_1336_f03-kernel-grammar-alias-help/`; strict verification
  passed.

### F-04 Governance Workbench System

- Status: final
- Governing spec:
  docs/arc/SPECS/260521_0040_governance-workbench-system_spec_01.md
- Why: Plans, tasks, evidence, logs, specs, and reports need a durable local
  execution model.
- Exit criteria: typed workbench model; command-managed
  plans/tasks/logs/evidence/reports/sidecars; evidence required for completion;
  closure validation catches drift.
- Closure note: accepted implementation evidence is `E-20260528084521802724`;
  closeout session `.afol/wb/260528_0833_f04-workbench-core-review-fix/`.

### F-05 Smart Rules and Skills Routing

- Status: final
- Governing spec:
  docs/arc/SPECS/260521_0050_smart-rules-and-skills-routing_spec_01.md
- Why: Agents should receive only relevant rules and skills for the current
  work.
- Exit criteria: rule router; skill router; surface detection; compact
  delegation context; project-local updateable rules and skills.
- Closure note: accepted implementation evidence is `E-20260528100236370279`;
  closeout session `.afol/wb/260528_0956_f05-review-parity-strict/`.

### F-06 File-First Low-Token Execution

- Status: final
- Governing spec:
  docs/arc/SPECS/260521_0060_file-first-low-token-execution_spec_01.md
- Why: Agents should save detailed work into files and return compact handoffs
  instead of flooding context.
- Exit criteria: research save flow; log append flow; compact handoff format;
  summary plus paths; routine updates avoid manual file editing.
- Closure note: accepted implementation evidence is `E-20260528103543755917`;
  closeout session `.afol/wb/260528_1029_f06-review-fix/`.

### F-07 Local State Index and Event Log

- Status: final
- Governing spec:
  docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md
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
  docs/arc/SPECS/260521_0080_safe-file-mutation-and-undo_spec_01.md
- Why: Agents need safe tools to move, patch, write, archive, and undo files.
- Exit criteria: mutation journal; session/task context; dry-run; undo where
  feasible; protected dangerous paths.
- Closure note: accepted implementation evidence is `E-20260528122615973830`;
  closeout session `.afol/wb/260528_1145_f08-safe-file-mutation-undo/`;
  board cleanup was accepted in `cb2e024`.

### F-09 Template Update and Versioning

- Status: final
- Governing spec:
  docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md
- Why: Downstream projects must receive updates when the core system improves.
- Exit criteria: project lock; managed manifest; update check; update preview;
  conflict detection; preserved local edits.
- Closure note: the parent spec is final and the accepted implementation
  evidence is `5a1811fe0a967fc8a89c2c78a2722d972e210700` and
  `6fc611a095cca821c9276aad5b29ecc1fbd3ea96`.

### F-10 Runtime Adapters and MCP

- Status: final
- Governing spec: docs/arc/SPECS/260521_0100_runtime-adapters-and-mcp_spec_01.md
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
  docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md
- Why: The system needs trust gates before work is marked complete or releases
  are published.
- Closure note: the accepted F-11 closeout is complete. Accepted evidence is
  the session-backed contract layer
  `.afol/wb/260528_1409_f11-validation-benchmark-contract`, selector/matrix
  pack-map commits `3a6456e` and `afe8a79`, real typecheck gate `a1fa3e1`,
  routing-accuracy `7760358`, update-safety `681c6d0`, and mutation-safety
  `8dd5e20`.
  Artifact-backed benchmark result persistence for the selected pack set is
  captured under `.agents/data/benchmarks/results/20260529_14263*_*.json`
  (one JSON per pack), with explicit waiver evidence for
  `runtime-live-agent` in
  `.agents/data/benchmarks/results/20260529_142633_runtime-live-agent.json`
  (`status=skipped`, `all-scenarios-skipped:not-implemented-live-runner`).
- Exit criteria: type checks; unit tests; schema tests; command parity tests;
  template export tests; workbench validation; MCP parity tests; benchmark
  packs for accuracy, speed, safety, quality, and token cost on risky changes.

### F-12 Public Distribution and Onboarding

- Status: final
- Governing spec:
  docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md
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
  docs/arc/SPECS/260411_agentic-runtime-restructure_spec_01.md
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
  docs/arc/SPECS/260412_1110_spec-child-and-spec-test-governance_spec_01.md
- Why: Child-spec naming, spec-test strategy docs, and legacy spec-lite
  compatibility need a clear governance anchor before any executable follow-up.
- Exit criteria: spec-child is documented as the canonical child/local spec
  artifact; spec-test is documented as the pre-test strategy artifact;
  spec-lite remains a legacy compatibility alias; the F-14 folder convention
  `docs/arc/SPECS/F-14/spec-tests/` is explicit.
- Closure note: accepted governance evidence is
  `E-20260528153442093351`; verified outcome summarized in
  `.afol/wb/260528_1528_spec-child-and-spec-test-governance/`
  and its final report.

### F-15 Repo-Wide Simplification Runtime Parity

- Status: final
- Governing spec:
  docs/arc/SPECS/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md
- Why: bounded simplification slices reduced runtime/script complexity and
  map drift without changing the public CLI behavior.
- Closure note: accepted child slices are final in `docs/arc/SPECS/INDEX.md`:
  scripts cleanup, map boundary cleanup, runtime registry parity, and python
  command simplification.
- Exit criteria: satisfied; strict governed evidence exists for the accepted
  slices and the current-state docs are reconciled.

### F-16 Export Contract Hardening

- Status: final
- Governing spec:
  docs/arc/SPECS/260413_1250_project-template-source-separation_spec_01.md
- Why: enforce a strict export contract so bootstrap/export dry-run copies only
  sanctioned `src/project-template` content and keeps history/noise out.
- Closure note: accepted implementation evidence `b520f23` and `75cf349` is
  complete; `docs/arc/SPECS/INDEX.md` now marks the parent spec as `final` and
  the current-state map docs reflect the closeout.
- Exit criteria: satisfied; the accepted export-contract and source-root helper
  slices are complete and the docs/governance surfaces are reconciled.

### F-17 Just Command Runner Migration

- Status: final
- Governing spec:
  docs/arc/SPECS/260413_1849_just-command-runner-migration_spec_01.md
- Why: retire `just` from the documented downstream path while preserving
  factory-only compatibility long enough to prove command parity and predictable
  validation behavior.
- Closure note: the parent spec is final and the accepted child slices are
  final.
- Exit criteria: aggregate validation entrypoints and standards mirrors stay in
  command parity; governed slices close with strict evidence.

### F-18 AFOL Administration, Project Structure, and Onion Architecture

- Status: planned
- Governing spec:
  docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md
- Why: AFOL needs a stable onion architecture and source-boundary model before
  adding SQLite hydration, memory, library, context bundles, and spec gates.
  Project direction should migrate from `docs/arc/**` into `.afol/adm/**`, and
  current-state structure maps should live under `.afol/pstr/**`.
- Relationship to prior features: F-18 extends the final F-04 workbench, F-05
  routing, F-06 file-first handoff, F-07 local-state contracts, and the draft
  F-18 operational-state specs. It supersedes the narrow JSON-source direction
  with Markdown/YAML canonical administration plus SQLite materialization.
- Exit criteria:
  - Project manifesto names AFOL as a layered local execution OS for agents.
  - `.afol/adm/**` is specified as target project administration for roadmap,
    specs, ADRs, changelog, archive, and doctrine.
  - `.afol/pstr/**` is specified as target project structure for maps,
    inventories, and current-state evidence.
  - `docs/arc/**` remains the current transitional authority until migration
    commands, drift validation, and indexes are implemented.
  - Onion layers define doctrine, authority, contracts, hydration/projection,
    domain services, providers, CLI commands, and runtime adapters.
  - Memory and library boundaries are explicit and separate.
  - SQLite is specified as rebuildable materialized execution state, not the
    only human-readable source.
  - Legacy `.agents/agents`, `.agents/scripts`, `.agents/runtime`,
    `.agents/wb`, `.agents/z-arq`, `agents.config`, and legacy delegate routing
    remain prohibited.

Follow-on slices under this direction:

- SQLite hydration and execution state.
- Markdown projection and drift validation.
- Project memory system.
- Library Markdown knowledge graph with optional IWE provider.
- Context bundle and tool routing.
- Spec compatibility and closure gates.
- ADR, changelog, archive, and cleanup commands.

## 6) Recommended Delivery Phases

1. Strategy and design: manifesto, roadmap, specs, architecture, command
   system, product/factory boundary, compatibility constraints.
1. CLI kernel: Bun/TypeScript skeleton, `afol`, project detection, config/lock
   reading, short router, compact output, compatibility delegation.
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
