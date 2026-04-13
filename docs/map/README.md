---
title: "Repository Map"
description: "Entry point for the generated repository map, including reading order, scope, and current structural signals."
doc_kind: "codemap-index"
version: "v2026-04-02_1"
created_at: "2026-04-02T23:28:28Z"
updated_at: "2026-04-02T23:28:28Z"
---

## Repository Map

This folder is the distilled architecture view of the repository.

### Scaffold Contract

- `docs/map/` is the only durable current-state, descriptive evidence surface for repository mapping.
- Goal-state canon stays outside this folder in `docs/arc/`, roadmap, specs, ADRs, and related architecture docs.
- `docs/map/structure/` is the canonical current-state structure index for physical layout and folder-convention evidence.
- `docs/arc/structure/` is a legacy generated surface and is retired rather than maintained as a second current-state map.
- Use this map for refreshable observation and analysis, not as approval authority for desired-state decisions.

### Read This First

- Repo: `agentic_start_folder`
- Current version: `v2026-04-02_1`
- Targets analyzed: `.`
- Raw evidence: `extra/`

### What This Map Is Supposed To Answer

- Which domains exist and why they exist.
- Which files define the public boundaries and integration points.
- Which files other code depends on most heavily.
- Which hotspots and static findings deserve attention first.
- Where the main classes, functions, interfaces, and constants live.

### Recommended Reading Order

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

### What Lives Where

- Root `.md` files: distilled explanations for agents and humans.
- `domains/`: domain-focused breakdowns with responsibilities, key files, and risks.
- `structure/`: the current-state physical layout view and section files.
- `extra/`: raw tool outputs, logs, and machine-readable evidence.

### System Overview

- No concise README system summary was extracted; rely on the domain and architecture docs below.

### Major Runtime Surfaces

- `.agents/scripts`: Python command surface for governance, validation, bootstrap, repo maps, and runtime adapters.
- `docs/`: Canonical project documentation surface for standards, architecture, patterns, templates, and telemetry guidance.
- `.agents/skills`: Project-local skill surface synced into the repository for interactive runtimes.
- `AGENTS.md`, `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, `GEMINI.md`: Operator/runtime instruction entrypoints mirrored from the canonical contract.

### Cross-Domain Flow

- Cross-domain flows must be inferred from the available route, symbol, and dependency artifacts.

### Product And Platform Signals

- No feature bullets were extracted from the repo README.

### Current System Shape

- Stack signals: `none detected`
- Runtime versions: `not declared`
- Stack versions: `not declared`
- Dependency graph source: `dependency-cruiser`
- Modules analyzed: `43`
- Internal dependency edges: `0`
- Route-bearing files: `0`
- Public boundary files: `0`
- Hotspots ranked: `50`

### Critical Signals

- Top hotspot: `n/a`
- Circular dependencies: `0`
- Orphan modules: `41`
- Semgrep auto findings: `260`
- Semgrep custom findings: `28`
