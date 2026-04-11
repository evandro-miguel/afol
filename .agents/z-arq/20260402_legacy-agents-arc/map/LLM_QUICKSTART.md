---
title: "LLM Quick Start Guide"
description: "Agent-facing orientation doc for understanding the repository quickly and safely."
doc_kind: "quickstart"
version: "v2026-04-02_1"
created_at: "2026-04-02T23:17:01Z"
updated_at: "2026-04-02T23:17:01Z"
---

## LLM Quick Start Guide

Read this first. This document is the orientation layer for agents entering the repository.

### What This Repo Is

- Repository: `agentic_start_folder`
- Analysis mode: `standard`
- Runtime surfaces: `none detected`
- Stack signals: `none detected`

### Start Here

- Read `README.md`, `ARCHITECTURE.md`, and `CHANGELOG.md` first.
- Use `API_MAP.md` and `BACKEND.md` to navigate backend route handlers, CLI entrypoints, MCP servers, and config boundaries.
- Use `FRONTEND.md` when the change touches client-side routes or UI wiring.
- Use `HOTSPOTS.md` and `SYMBOLS.md` when choosing where to implement or debug changes.

### Public Boundaries

- No public boundaries were detected.

### Boundary Families

- Backend route files: none detected
- No backend route boundaries were detected.

- CLI boundary files: none detected
- No CLI boundaries were detected.

- MCP entrypoints: none detected
- No MCP entrypoints were detected.

- Config boundary files: none detected
- No config boundaries were detected.

- Frontend route files: none detected
- No frontend route-like boundaries were detected.

- Convex HTTP route files: none detected
- No Convex HTTP route boundaries were detected.

- External fetch files: none detected
- No outbound fetch boundaries were detected.

### Risk-Heavy Files

- No hotspots were ranked.

### Key Working Rule

- Prefer the codemap and artifacts first. Only widen into raw source when a boundary, hotspot, or missing contract requires it.
