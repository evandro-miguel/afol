---
title: "Architecture"
description: "High-level explanation of the repository structure, major domains, dependency hubs, and primary architectural risks."
doc_kind: "architecture"
version: "v2026-04-02_1"
created_at: "2026-04-02T23:28:28Z"
updated_at: "2026-04-02T23:28:28Z"
---

## Architecture

### What This System Appears To Do

- Python utilities or service-side scripts are present and should be considered part of the operating surface.
- Dominant feature clusters: `.agents/scripts, docs, .agents/skills`.
- Public boundaries currently concentrate in `.agents/agents`, `Justfile`, and the runtime instruction entrypoints.

### Runtime Topology

- Cross-domain flows must be inferred from the available route, symbol, and dependency artifacts.

### Why The Main Domains Exist

- `.agents/scripts`: Operational Python command family for doctor, bootstrap, sync, repo-map, workbench, and validation flows.
- `docs/`: Standards, templates, goal-state canon, patterns, telemetry docs, and other project-facing documentation surfaces.
- `.agents/skills`: Repo-local skill payloads selected for interactive runtimes.
- Runtime instruction entrypoints (`AGENTS.md`, mirrors, and adapter files): Thin contract surfaces for Codex, OpenCode, Qwen, Claude, and Gemini style runtimes.

### Core Boundaries And Why They Matter

### Structural Signals

- Primary dependency source: `dependency-cruiser`
- Modules analyzed: `43`
- Internal dependency edges: `0`
- Backend route-bearing files: `0`
- Frontend route or page entry files: `0`
- Files with external fetch calls: `0`
- Orphan modules: `41`

### Top Dependency Hubs

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |

### Primary Risks To Understand First

### Critical Static Findings

- Auto findings: `260`
- Custom findings: `28`
