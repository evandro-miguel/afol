---
title: "Connections"
description: "Connection map showing high fan-in files, unstable orchestrators, co-change pairs, and representative direct links."
doc_kind: "connections"
version: "v2026-05-28_1"
created_at: "2026-05-28T09:48:25Z"
updated_at: "2026-05-28T09:48:25Z"
---

# Connections

Use this file when you need a fast answer to `what depends on what` or `which files move together`.

## System-Level Linkage

- Cross-domain flows must be inferred from the available route, symbol, and dependency artifacts.

## Highest Fan-In Files

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |
| close-with-grace | 1.00 | 0.00 | 0.00 |
| assert/strict | 0.00 | 0.00 | 0.00 |
| http | 0.00 | 0.00 | 0.00 |
| node:test | 0.00 | 0.00 | 0.00 |

## Highest Fan-Out Or Instability

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |
| .claude/skills/node/rules/assets/graceful-server.ts | 0.00 | 1.00 | 1.00 |
| .claude/skills/node/rules/assets/graceful-server.test.ts | 0.00 | 0.00 | 0.00 |
| .claude/skills/typescript-expert/references/utility-types.ts | 0.00 | 0.00 | 0.00 |
| assert/strict | 0.00 | 0.00 | 0.00 |
| close-with-grace | 1.00 | 0.00 | 0.00 |
| http | 0.00 | 0.00 | 0.00 |
| node:test | 0.00 | 0.00 | 0.00 |

## Co-Change Pairs

| File A | File B | Co-change | Confidence |
| --- | ---: | ---: | ---: |

## Python Symbol-Level Connections

- Source: `extra/phase2/python-symbol-graph.json`
- Indexed symbols: `11`
- Call edges: `15`
- Import edges: `0`

### Most Called Python Symbols

| Symbol | Path | Line | Calls |
| --- | ---: | ---: | ---: |
| run_cmd | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 13 | 7 |
| check_versions | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 21 | 1 |
| check_tsconfig | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 32 | 1 |
| check_tooling | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 74 | 1 |
| check_monorepo | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 111 | 1 |
| check_any_usage | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 145 | 1 |
| check_type_assertions | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 160 | 1 |
| check_type_errors | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 132 | 1 |
| check_performance | .claude/skills/typescript-expert/scripts/ts_diagnostic.py | 172 | 1 |

### Test-To-Source Call Links

- No direct test-to-source Python call links detected.

## Cycle Chains

- No cycles detected

## Representative Direct Links
