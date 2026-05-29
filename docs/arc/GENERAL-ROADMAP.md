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

1. Add ./a as the new project-local front door.
2. Delegate from ./a to existing .agents/agents commands where parity does not
   exist yet.
3. Implement one typed Bun/TypeScript command family at a time.
4. Keep Python/Bash paths until parity tests prove the replacement.
5. Shrink src/project-template only after bootstrap/export validation proves
   downstream installs still work.

## 5) Feature Portfolio

### F-00 Total Reformulation Strategy

- Status: planned
- Governing spec:
  docs/arc/SPECS/260521_0000_total-reformulation-strategy_spec_01.md
- Why: The project needs one coherent strategy before architecture, command
  design, and migration work begin.
- Exit criteria: manifesto exists; roadmap exists; feature specs exist;
  product/factory boundary is explicit; Bun/TS migration direction is explicit.

### F-01 Universal Agent CLI

- Status: planned
- Governing spec: docs/arc/SPECS/260521_0010_universal-agent-cli_spec_01.md
- Why: Logic should live in one updateable CLI instead of being copied into
  every project.
- Exit criteria: Bun/TypeScript CLI architecture is defined; CLI runs from ./a;
- CLI reads local project state; CLI supports version lock and update checks;
  compatibility delegation preserves current behavior until parity.

### F-02 Minimal Project Template

- Status: planned
- Governing spec: docs/arc/SPECS/260521_0020_minimal-project-template_spec_01.md
- Why: Downstream projects need only the local state and minimal docs required
  for agents to operate.
- Exit criteria: src/project-template becomes minimal; template contains
  config, lock, manifest, rules, skills, workbench, and required docs; factory
  noise is excluded; bootstrap/export validates cleanliness.

### F-03 Agent Command Design System

- Status: planned
- Governing spec:
  docs/arc/SPECS/260521_0030_agent-command-design-system_spec_01.md
- Why: Agents should use short, predictable commands to reduce repeated token
  cost.
- Exit criteria: short grammar exists; long aliases exist; high-frequency
  operations use 1-3 letter commands; compact output is default; JSON output is
  available.

### F-04 Governance Workbench System

- Status: planned
- Governing spec:
  docs/arc/SPECS/260521_0040_governance-workbench-system_spec_01.md
- Why: Plans, tasks, evidence, logs, specs, and reports need a durable local
  execution model.
- Exit criteria: typed workbench model; command-managed
  plans/tasks/logs/evidence/reports/sidecars; evidence required for completion;
  closure validation catches drift.

### F-05 Smart Rules and Skills Routing

- Status: planned
- Governing spec:
  docs/arc/SPECS/260521_0050_smart-rules-and-skills-routing_spec_01.md
- Why: Agents should receive only relevant rules and skills for the current
  work.
- Exit criteria: rule router; skill router; surface detection; compact
  delegation context; project-local updateable rules and skills.

### F-06 File-First Low-Token Execution

- Status: planned
- Governing spec:
  docs/arc/SPECS/260521_0060_file-first-low-token-execution_spec_01.md
- Why: Agents should save detailed work into files and return compact handoffs
  instead of flooding context.
- Exit criteria: research save flow; log append flow; compact handoff format;
  summary plus paths; routine updates avoid manual file editing.

### F-07 Local State Index and Event Log

- Status: planned
- Governing spec:
  docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md
- Why: Agents should query compact state instead of repeatedly scanning raw
  files.
- Exit criteria: local indexes for workbench, rules, skills, specs, and files;
  event log records command and file activity; compact queries; optional watcher
  plan.

### F-08 Safe File Mutation and Undo

- Status: planned
- Governing spec:
  docs/arc/SPECS/260521_0080_safe-file-mutation-and-undo_spec_01.md
- Why: Agents need safe tools to move, patch, write, archive, and undo files.
- Exit criteria: mutation journal; session/task context; dry-run; undo where
  feasible; protected dangerous paths.

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
  `.agents/wb/260528_1343_runtime-adapters-and-mcp/`.

### F-11 Validation, CI, and Benchmarks

- Status: final
- Governing spec:
  docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md
- Why: The system needs trust gates before work is marked complete or releases
  are published.
- Closure note: the accepted F-11 closeout is complete. Accepted evidence is
  the session-backed contract layer
  `.agents/wb/260528_1409_f11-validation-benchmark-contract`, selector/matrix
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
  docs; examples; private assumptions removed.
- Closure note: accepted implementation evidence is
  `E-20260528144544308053`; closeout session
  `.agents/wb/260528_1444_public-distribution-and-onboarding/`.

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
  `.agents/wb/260528_1528_spec-child-and-spec-test-governance/`
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

- Status: active
- Governing spec:
  docs/arc/SPECS/260413_1250_project-template-source-separation_spec_01.md
- Why: enforce a strict export contract so bootstrap/export dry-run copies only
  sanctioned `src/project-template` content and keeps history/noise out.
- Exit criteria: bootstrap export tests prove forbidden paths are excluded and
  dry-run output remains source-of-truth aligned with `src/project-template`.

### F-17 Just Command Runner Migration

- Status: final
- Governing spec:
  docs/arc/SPECS/260413_1849_just-command-runner-migration_spec_01.md
- Why: keep `just` as the canonical command runner while preserving command
  parity and predictable validation behavior.
- Closure note: the parent spec is final and the accepted child slices are
  final.
- Exit criteria: aggregate validation entrypoints and standards mirrors stay in
  command parity; governed slices close with strict evidence.

## 6) Recommended Delivery Phases

1. Strategy and design: manifesto, roadmap, specs, architecture, command
   system, product/factory boundary, compatibility constraints.
1. CLI kernel: Bun/TypeScript skeleton, ./a, project detection, config/lock
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

The MVP should include ./a, Bun/TypeScript CLI, config and lock, short command
grammar, status, new, task start/done, evidence add, log add, verify, close,
rule resolve, skill list/update, template update check, and minimal validation.

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
