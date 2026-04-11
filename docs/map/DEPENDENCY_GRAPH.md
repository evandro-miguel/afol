---
title: "Dependency Graph"
description: "Dependency-centric view of cycles, orphan modules, major hubs, and orchestrator files."
doc_kind: "dependency-graph"
version: "v2026-04-02_1"
created_at: "2026-04-02T23:28:28Z"
updated_at: "2026-04-02T23:28:28Z"
---

## Dependency Graph

### How To Read This File

- Fan-in (`Ca`) highlights files other code depends on heavily.
- Fan-out (`Ce`) highlights files that coordinate many downstream concerns.
- Instability near `1.00` often marks orchestration or test entry surfaces; interpret it with role context.

### Graph Source

- Primary summary source: `extra/phase1/depcruise.json`

### Cycle Summary

- Cycles detected: `0`

- No cycles detected

### Orphan Modules

- `Processed 40 files (788ms) (11 warnings)`
- `.claude/skills/typescript-skill/references/utility-types.ts`
- `.claude/skills/writing-skills/scripts/check-skill.js`
- `.claude/skills/writing-skills/scripts/check-tier-migration.js`
- `.claude/skills/writing-skills/scripts/check-universal-skills-sync.js`
- `.claude/skills/writing-skills/scripts/cleanup-empty-folders.js`
- `.claude/skills/writing-skills/scripts/create-skill.js`
- `.claude/skills/writing-skills/scripts/fix-skill.js`
- `.claude/skills/writing-skills/scripts/skill-advisor.js`
- `.claude/skills/writing-skills/scripts/skill-files.js`
- `.claude/skills/writing-skills/scripts/skill-read.js`
- `.codex/skills/typescript-skill/references/utility-types.ts`
- `.codex/skills/writing-skills/scripts/check-skill.js`
- `.codex/skills/writing-skills/scripts/check-tier-migration.js`
- `.codex/skills/writing-skills/scripts/check-universal-skills-sync.js`
- `.codex/skills/writing-skills/scripts/cleanup-empty-folders.js`
- `.codex/skills/writing-skills/scripts/create-skill.js`
- `.codex/skills/writing-skills/scripts/fix-skill.js`
- `.codex/skills/writing-skills/scripts/skill-advisor.js`
- `.codex/skills/writing-skills/scripts/skill-files.js`

### Files That Other Code Relies On

| Path | Ca | Ce | I |
| --- | ---: | ---: | ---: |

### Files That Orchestrate Many Downstream Concerns

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
