---
name: llm-markdown-skill
description: MOVED - Use markdownlint-skill instead. This skill has been merged into markdownlint-skill for unified markdown linting and LLM pipeline integration.
metadata:
  deprecated: true
  migrated_to: markdownlint-skill
  archived_on: "2026-02-28"
---

# This skill has been merged

**New location:** `markdownlint-skill`

The LLM markdown functionality has been merged into the main markdownlint-skill for better consolidation.

## Migration

Use the unified skill:

```javascript
skill({ name: "markdownlint-skill" })
```

The new skill includes:

- Global commands (lint-md, fix-md, validate-md)
- LLM pipeline integration patterns
- CI/CD setup
- Strict configuration for AI-generated content

See: [markdownlint-skill](../markdownlint-skill/SKILL.md)
