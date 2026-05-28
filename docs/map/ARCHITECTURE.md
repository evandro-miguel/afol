---
title: "Architecture"
description: "High-level explanation of the repository structure, major domains, dependency hubs, and primary architectural risks."
doc_kind: "architecture"
version: "v2026-05-28_1"
created_at: "2026-05-28T09:48:25Z"
updated_at: "2026-05-28T09:48:25Z"
---

# Architecture

## What This System Appears To Do

- Python utilities or service-side scripts are present and should be considered part of the operating surface.
- Dominant feature clusters: `.agents/scripts, docs, .agents/skills`.
- Public boundaries currently concentrate in `.agents/agents`, `Justfile`, and the runtime instruction entrypoints.
## Runtime Topology

- Cross-domain flows must be inferred from the available route, symbol, and dependency artifacts.

## Why The Main Domains Exist

- `.agents/scripts`: Operational Python command family for doctor, bootstrap, sync, repo-map, workbench, and validation flows.
- `docs/`: Standards, templates, goal-state canon, patterns, telemetry docs, and other project-facing documentation surfaces.
- `.agents/skills`: Repo-local skill payloads selected for interactive runtimes.
- Runtime instruction entrypoints (`AGENTS.md` and the Claude mirror): Thin contract surfaces for interactive runtimes.
## Core Boundaries And Why They Matter

- `close-with-grace`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `assert/strict`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `http`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `node:test`: Test surface protecting behavior or documenting expected system behavior.

## Structural Signals

- Primary dependency source: `dependency-cruiser`
- Modules analyzed: `7`
- Internal dependency edges: `1`
- Python symbol graph: `11` nodes across `1` files
- Python parse errors: `0`
- Backend route-bearing files: `0`
- Frontend route or page entry files: `0`
- Files with external fetch calls: `0`
- Orphan modules: `3`

## Top Dependency Hubs

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |
| close-with-grace | 1.00 | 0.00 | 0.00 |
| assert/strict | 0.00 | 0.00 | 0.00 |
| http | 0.00 | 0.00 | 0.00 |
| node:test | 0.00 | 0.00 | 0.00 |

## Primary Risks To Understand First


## Critical Static Findings

- Auto findings: `1`
- Custom findings: `5`
