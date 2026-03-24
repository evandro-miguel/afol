---
title: "Architecture"
description: "High-level explanation of the repository structure, major domains, dependency hubs, and primary architectural risks."
doc_kind: "architecture"
version: "v2026-03-23_2"
created_at: "2026-03-23T21:25:46Z"
updated_at: "2026-03-23T21:28:11Z"
---

# Architecture

## What This System Appears To Do

- The repository profile is mixed or minimal; the main shape must be inferred from dependencies, symbols, and hotspots.
- Dominant feature clusters: `.agents/scripts, .agents/.cache, .agents/skills`
- Public boundaries currently concentrate in `no public boundaries detected in scope`.

## Runtime Topology

- Cross-domain flows must be inferred from the available route, symbol, and dependency artifacts.

## Why The Main Domains Exist


## Core Boundaries And Why They Matter

- `.claude/skills/typescript-skill/references/utility-types.ts`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.claude/skills/writing-skills/scripts/check-skill.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.claude/skills/writing-skills/scripts/check-tier-migration.js`: Persistence or data-access surface that shapes storage behavior.
- `.claude/skills/writing-skills/scripts/check-universal-skills-sync.js`: Ingestion and synchronization logic moving content into the system.
- `.claude/skills/writing-skills/scripts/cleanup-empty-folders.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.claude/skills/writing-skills/scripts/create-skill.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.claude/skills/writing-skills/scripts/fix-skill.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.claude/skills/writing-skills/scripts/skill-advisor.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.claude/skills/writing-skills/scripts/skill-files.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.claude/skills/writing-skills/scripts/skill-read.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.codex/skills/typescript-skill/references/utility-types.ts`: High-signal file surfaced by dependency, symbol, or hotspot analysis.
- `.codex/skills/writing-skills/scripts/check-skill.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis.

## Structural Signals

- Primary dependency source: `dependency-cruiser`
- Modules analyzed: `43`
- Internal dependency edges: `0`
- Backend route-bearing files: `0`
- Frontend route or page entry files: `0`
- Files with external fetch calls: `0`
- Orphan modules: `1`

## Top Dependency Hubs

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |
| .claude/skills/typescript-skill/references/utility-types.ts | 0.00 | 0.00 | 0.00 |
| .claude/skills/writing-skills/scripts/check-skill.js | 0.00 | 0.00 | 0.00 |
| .claude/skills/writing-skills/scripts/check-tier-migration.js | 0.00 | 0.00 | 0.00 |
| .claude/skills/writing-skills/scripts/check-universal-skills-sync.js | 0.00 | 0.00 | 0.00 |
| .claude/skills/writing-skills/scripts/cleanup-empty-folders.js | 0.00 | 0.00 | 0.00 |
| .claude/skills/writing-skills/scripts/create-skill.js | 0.00 | 0.00 | 0.00 |
| .claude/skills/writing-skills/scripts/fix-skill.js | 0.00 | 0.00 | 0.00 |
| .claude/skills/writing-skills/scripts/skill-advisor.js | 0.00 | 0.00 | 0.00 |
| .claude/skills/writing-skills/scripts/skill-files.js | 0.00 | 0.00 | 0.00 |
| .claude/skills/writing-skills/scripts/skill-read.js | 0.00 | 0.00 | 0.00 |
| .codex/skills/typescript-skill/references/utility-types.ts | 0.00 | 0.00 | 0.00 |
| .codex/skills/writing-skills/scripts/check-skill.js | 0.00 | 0.00 | 0.00 |

## Primary Risks To Understand First

- `.agents/scripts/lib/execution_commands.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Hotspot score `548603.46`.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-tools.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Hotspot score `421969.81`.
- `.agents/skills/writing-skills/scripts/check-skill.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Hotspot score `385690.97`.
- `.agents/scripts/verify-tasks.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Hotspot score `371032.45`.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-wb-update.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Hotspot score `268415.45`.
- `.agents/scripts/agents-telemetry.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Hotspot score `266524.17`.
- `.agents/.cache/upstream/snapshot-origin-main/.agents/scripts/agents-structure-map.py`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Hotspot score `255878.12`.
- `.agents/skills/writing-skills/scripts/skill-advisor.js`: High-signal file surfaced by dependency, symbol, or hotspot analysis. Hotspot score `217321.77`.

## Critical Static Findings

- Auto findings: `0`
- Custom findings: `0`
