---
title: "Dependency Graph"
description: "Dependency-centric view of cycles, orphan modules, major hubs, and orchestrator files."
doc_kind: "dependency-graph"
version: "v2026-05-28_1"
created_at: "2026-05-28T09:48:25Z"
updated_at: "2026-05-28T09:48:25Z"
---

# Dependency Graph

## How To Read This File

- Fan-in (`Ca`) highlights files other code depends on heavily.
- Fan-out (`Ce`) highlights files that coordinate many downstream concerns.
- Instability near `1.00` often marks orchestration or test entry surfaces; interpret it with role context.

## Graph Source

- Primary summary source: `extra/phase1/depcruise.json`
- Python symbol graph source: `extra/phase2/python-symbol-graph.json`

## Python Symbol Graph

- Indexed files: `1`
- Nodes: `11`
- Edges: `25`
- Contains edges: `10`
- Calls: `15`
- Imports: `0`
- Unresolved calls: `79`
- Parse errors: `0`

### Files With The Most Python Call Edges

| Path | Call Edges |
| --- | ---: |
| .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 15 |

### Python Symbols With The Most Outgoing Calls

| Symbol | Path | Calls |
| --- | ---: | ---: |
| main | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 8 |
| check_versions | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 2 |
| check_any_usage | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 2 |
| check_type_errors | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 1 |
| check_type_assertions | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 1 |
| check_performance | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 1 |

## Cycle Summary

- Cycles detected: `0`

- No cycles detected

## Orphan Modules

- `.claude/skills/node/rules/assets/graceful-server.test.ts`
- `.claude/skills/node/rules/assets/graceful-server.ts`
- `.claude/skills/typescript-expert/references/utility-types.ts`

## Files That Other Code Relies On

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |
| close-with-grace | 1.00 | 0.00 | 0.00 |
| assert/strict | 0.00 | 0.00 | 0.00 |
| http | 0.00 | 0.00 | 0.00 |
| node:test | 0.00 | 0.00 | 0.00 |

## Files That Orchestrate Many Downstream Concerns

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |
| .claude/skills/node/rules/assets/graceful-server.ts | 0.00 | 1.00 | 1.00 |
| .claude/skills/node/rules/assets/graceful-server.test.ts | 0.00 | 0.00 | 0.00 |
| .claude/skills/typescript-expert/references/utility-types.ts | 0.00 | 0.00 | 0.00 |
| assert/strict | 0.00 | 0.00 | 0.00 |
| close-with-grace | 1.00 | 0.00 | 0.00 |
| http | 0.00 | 0.00 | 0.00 |
| node:test | 0.00 | 0.00 | 0.00 |
