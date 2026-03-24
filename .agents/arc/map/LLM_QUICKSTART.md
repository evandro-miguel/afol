---
title: "LLM Quick Start Guide"
description: "Agent-facing orientation doc for understanding the repository quickly and safely."
doc_kind: "quickstart"
version: "v2026-03-23_2"
created_at: "2026-03-23T21:25:46Z"
updated_at: "2026-03-23T21:28:11Z"
---

# LLM Quick Start Guide

Read this first. This document is the orientation layer for agents entering the repository.

## What This Repo Is

- Repository: `agentic_start_folder`
- Analysis mode: `standard`
- Runtime surfaces: `.`
- Stack signals: `none detected`

## Start Here

- Read `README.md`, `ARCHITECTURE.md`, and `CHANGELOG.md` first.
- Use `BACKEND.md`, `FRONTEND.md`, and `API_MAP.md` to navigate runtime boundaries.
- Use `HOTSPOTS.md` and `SYMBOLS.md` when choosing where to implement or debug changes.

## Public Boundaries

- No route-like boundaries were detected.

## Risk-Heavy Files

- `.agents/scripts/lib/execution_commands.py`
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-tools.py`
- `.agents/skills/writing-skills/scripts/check-skill.js`
- `.agents/scripts/verify-tasks.py`
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-wb-update.py`
- `.agents/scripts/agents-telemetry.py`
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-structure-map.py`
- `.agents/skills/writing-skills/scripts/skill-advisor.js`

## Key Working Rule

- Prefer the codemap and artifacts first. Only widen into raw source when a boundary, hotspot, or missing contract requires it.
