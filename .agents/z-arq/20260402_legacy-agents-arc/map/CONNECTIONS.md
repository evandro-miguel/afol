---
title: "Connections"
description: "Connection map showing high fan-in files, unstable orchestrators, co-change pairs, and representative direct links."
doc_kind: "connections"
version: "v2026-04-02_1"
created_at: "2026-04-02T23:17:01Z"
updated_at: "2026-04-02T23:17:01Z"
---

# Connections

Use this file when you need a fast answer to `what depends on what` or `which files move together`.

## System-Level Linkage

- Cross-domain flows must be inferred from the available route, symbol, and dependency artifacts.

## Highest Fan-In Files

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |

## Highest Fan-Out Or Instability

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

## Co-Change Pairs

| File A | File B | Co-change | Confidence |
| --- | ---: | ---: | ---: |
| .agents/arc/structure/README.md | .agents/arc/structure/backend.md | 10 | 1.00 |
| .agents/arc/structure/README.md | .agents/arc/structure/tests.md | 10 | 1.00 |
| .agents/arc/structure/backend.md | .agents/arc/structure/tests.md | 10 | 1.00 |
| .agents/a-docs/standards/Makefile | .agents/a-docs/standards/scripts-reference.md | 8 | 1.00 |
| .agents/arc/structure/README.md | .agents/arc/structure/data.md | 8 | 1.00 |
| .agents/arc/structure/backend.md | .agents/arc/structure/data.md | 8 | 1.00 |
| .agents/arc/structure/data.md | .agents/arc/structure/tests.md | 8 | 1.00 |
| .agents/a-docs/standards/Makefile | .agents/scripts/agents-doctor.py | 7 | 1.00 |
| .agents/arc/structure/README.md | .agents/arc/structure/types.md | 7 | 1.00 |
| .agents/arc/structure/README.md | .agents/scripts/agents-doctor.py | 7 | 1.00 |
| .agents/arc/structure/README.md | .agents/scripts/verify-tasks.py | 7 | 1.00 |
| .agents/arc/structure/backend.md | .agents/arc/structure/types.md | 7 | 1.00 |

## Cycle Chains

- No cycles detected

## Representative Direct Links
