---
title: "Backend"
description: "Backend-oriented map of public boundaries, integration surfaces, and risk-heavy files."
doc_kind: "backend"
version: "v2026-03-23_2"
created_at: "2026-03-23T21:25:46Z"
updated_at: "2026-03-23T21:28:11Z"
---

# Backend

## Backend Shape

- This file focuses on server-side logic, public request boundaries, jobs, scripts, data access, and outbound integrations.
- Use it to answer which runtime surface owns a workflow, where data crosses trust boundaries, and which files coordinate backend behavior.

## Backend Domains

- `.agents`: Repository domain with grouped responsibilities inferred from file structure and symbols.

## High-Leverage Backend Files

- `.agents/scripts/lib/execution_commands.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-tools.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.agents/skills/writing-skills/scripts/check-skill.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.agents/scripts/verify-tasks.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-wb-update.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.agents/scripts/agents-telemetry.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-structure-map.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.agents/skills/writing-skills/scripts/skill-advisor.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-lint-docs.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.agents/scripts/agents-skills-sync.py`: Ingestion and synchronization logic moving content into the system.

## Backend Public Boundaries

- No public backend boundary files were detected in the scanned scope.

## Structural Support Surfaces

- No additional backend support surfaces were detected beyond dependency and symbol signals.

## Integration Surfaces

- No external fetch surfaces detected in the scanned scope.

## Backend Risk Signals

- No Semgrep findings detected in the analyzed backend surfaces.
