---
title: Dependency Graph
description: Dependency-centric view of cycles, orphan modules, major hubs, and orchestrator
  files.
doc_kind: dependency-graph
version: v2026-04-02_1
created_at: '2026-04-02T23:28:28Z'
updated_at: '2026-04-12T13:42:43-03:00'
---

## Dependency Graph

### How To Read This File

- Fan-in (`Ca`) highlights files other code depends on heavily.
- Fan-out (`Ce`) highlights files that coordinate many downstream concerns.
- Instability near `1.00` often marks orchestration or test entry surfaces; interpret it with role context.

### Graph Source

- Primary summary source: `extra/phase1/depcruise.json`
- Refresh note: the 2026-04-12 refresh attempt produced a degenerate
  `Processed 0 files` dependency artifact, so stale references to removed
  runtime skill mirrors were removed here instead of publishing invalid graph
  rows. Re-run `.agents/agents repo-map .` after the analyzer emits a
  non-degenerate dependency graph for hidden runtime folders.

### Cycle Summary

- Cycles detected: `0`

- No cycles detected

### Orphan Modules

- No current orphan-module list is published because the latest dependency
  analyzer output was degenerate and the prior list referenced removed skill
  mirrors.

### Files That Other Code Relies On

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |

### Files That Orchestrate Many Downstream Concerns

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |
