---
title: "API Map"
description: "Public surface map covering routes, callable boundaries, and supporting integration or contract files."
doc_kind: "api-map"
version: "v2026-04-02_1"
created_at: "2026-04-02T23:28:28Z"
updated_at: "2026-04-02T23:28:28Z"
---

## API Map

### Public Surface Summary

- This file covers entry surfaces, route handlers, callable server boundaries, and files that reach external systems.
- Stack signals affecting public surfaces: `none detected`

### Count Semantics

- `raw matches`: every AST match emitted by `ast-grep`.
- `unique files`: de-duplicated files containing one or more matches.
- `curated boundary files`: the de-duplicated file list documented below for actual public surfaces.

### Public Boundary Counts

- CLI entrypoints: `2`
- Runtime instruction entrypoints: `5`
- Command script boundaries: `21`

### Public Boundary Files

- `.agents/agents`
- `Makefile`
- `AGENTS.md`
- `CLAUDE.md`

### Supporting Integration And Contract Surfaces

- `.agents/agents.config`: Repository-local runtime, path, and skills-sync contract.
- `.agents/tools.json`: Tool catalog surfaced by the wrapper and tools commands.
- `.agents/skills-sync.manifest.json`: Pinned project-local skills selection and source contract.
- `.claude/`: Secret-free Claude adapter notes and rule links committed with the scaffold.
