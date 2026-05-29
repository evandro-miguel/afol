---
title: "Repository Map"
description: "Entry point for the generated repository map, including reading order, scope, and current structural signals."
doc_kind: "codemap-index"
version: "v2026-05-28_1"
created_at: "2026-05-28T09:48:25Z"
updated_at: "2026-05-28T23:10:13Z"
---

# Repository Map

This folder is the distilled current-state evidence surface for the repository.

## Scaffold Contract

- `docs/map/` is the current-state, descriptive evidence surface for repository mapping.
- Goal-state canon stays outside this folder in `docs/arc/`, roadmap, specs, ADRs, and related architecture docs.
- Use this map for refreshable observation and analysis, not as approval authority for desired-state decisions.
## Read This First

- Repo: `agentic_start_folder_dev_refactor_TS`
- Current version: `v2026-05-28_1`
- Targets analyzed: `.`
- Raw evidence: `extra/`

## What This Map Is Supposed To Answer

- Which domains exist and why they exist.
- Which files define the public boundaries and integration points.
- Which files other code depends on most heavily.
- Which hotspots and static findings deserve attention first.
- Where the main classes, functions, interfaces, and constants live.

## Recommended Reading Order

- `README.md`
- `CHANGELOG.md`
- `ARCHITECTURE.md`
- `FEATURES.md`
- `BACKEND.md`
- `FRONTEND.md`
- `API_MAP.md`
- `CONNECTIONS.md`
- `DEPENDENCY_GRAPH.md`
- `HOTSPOTS.md`
- `SYMBOLS.md`
- `domains/`
- `extra/`

## What Lives Where

- Root `.md` files: distilled explanations for agents and humans.
- `domains/`: domain-focused breakdowns with responsibilities, key files, and risks.
- `structure/`: lightweight physical-layout evidence for the current repository.
- `extra/`: raw tool outputs, logs, and machine-readable evidence.

## System Overview

- No concise README system summary was extracted; rely on the domain and architecture docs below.

## Lifecycle Snapshot

- F-11 validation, CI, and benchmarks is now in closeout: the current-state
  benchmark matrix has 8 packs, the parent spec is final in
  `docs/arc/SPECS/INDEX.md`, and the accepted waves are the contract layer,
  selector/matrix pack-map, real typecheck gate, routing-accuracy,
  update-safety, and mutation-safety. Selected-pack benchmark results are
  persisted under `.agents/data/benchmarks/results/20260529_14263*_*.json`,
  including explicit waiver evidence for `runtime-live-agent`
  (`status=skipped`) in
  `.agents/data/benchmarks/results/20260529_142633_runtime-live-agent.json`.
- F-13 tool catalog parity keeps the runtime registry, docs, and command
  surface aligned.
- F-13 `status` command family now runs natively in runtime (`agentic status`)
  with parity-preserving output/exit behavior against `agents-status.py`.
- F-13 `session catchup` now runs natively in runtime (`agentic session catchup`)
  with parity-preserving output/exit behavior against `agents-session.py`.
- F-13 `knowledge pull` now dispatches natively in runtime (`agentic knowledge pull`)
  with parity-preserving output/exit behavior against `agents-knowledge.py`.
- F-13 `knowledge list/search/show/index` now dispatch natively in runtime
  with parity-preserving output/exit behavior against `agents-knowledge.py`.
- `docs/arc/SPECS/INDEX.md` now reflects the F-17 parent spec and accepted child specs as `final`.
- `docs/map/CHANGELOG.md` records the F-17 closeout alongside the earlier F-13 closure note.
- `docs/arc/SPECS/INDEX.md` now reflects the F-09 parent spec as `final`.
- `docs/map/CHANGELOG.md` records the F-09 closeout alongside the earlier closure notes.

## Major Runtime Surfaces

- `.agents/scripts`: Python command surface for governance, validation, bootstrap, repo maps, and runtime adapters.
- `docs/`: Canonical project documentation surface for standards, architecture, patterns, templates, and telemetry guidance.
- `.agents/skills`: Project-local skill surface synced into the repository for interactive runtimes.
- `AGENTS.md` and `CLAUDE.md`: Operator/runtime instruction entrypoints; OpenCode, Qwen, Gemini, and Codex use `AGENTS.md` directly or global runtime config.
## Cross-Domain Flow

- Cross-domain flows must be inferred from the available route, symbol, and dependency artifacts.

## Product And Platform Signals

- No feature bullets were extracted from the repo README.

## Current System Shape

- Stack signals: `none detected`
- Runtime versions: `not declared`
- Stack versions: `not declared`
- Benchmark matrix: 8 packs in `.agents/data/benchmarks/registry.json` with
  scenarios and baselines under `.agents/data/benchmarks/scenarios/` and
  `.agents/data/benchmarks/baselines/`.
- Dependency graph source: `dependency-cruiser`
- Modules analyzed: `7`
- Internal dependency edges: `1`
- Python symbol graph: `11` nodes, `15` call edges, `0` import edges
- Python parse errors: `0`
- Route-bearing files: `0`
- Public boundary files: `2`
- Hotspots ranked: `50`

## Critical Signals

- Top hotspot: `n/a`
- Circular dependencies: `0`
- Orphan modules: `3`
- Semgrep auto findings: `1`
- Semgrep custom findings: `5`
