---
doc_type: pattern
id: "PAT-001"
type: "success"
status: "active"
tags: ["process", "tools", "discovery"]
effectiveness: "high"
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-06-09T21:10:00-03:00"
---

# Pattern: Discovery-First AFOL Usage

## Context

Starting scaffold work or choosing validation for a changed path.

## Pattern

1. Run `afol -h` for the supported public command surface.
2. Run `afol validate select --changed-path <path> --json` to choose gates.
3. Use `rg` for exact local discovery before opening broad context.
4. Execute only AFOL-supported commands.

## Example

```bash
afol -h
afol validate select --changed-path cli/main.ts --json
afol new auth-refactor --feature-id F-01 --parent-spec docs/arc/SPECS/example.md
```

Do not use retired `.agents/agents` tools discovery.
