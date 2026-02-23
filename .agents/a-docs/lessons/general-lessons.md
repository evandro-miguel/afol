---
doc_type: lessons
status: active
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
---

# General Lessons

## Purpose
Central repository of learnings and prevention rules.
Updated after every user correction.

## Lessons log

### 2026-02-23 - Initial setup
**Context:** Creating standard agentic folder structure

**Lesson:** Establish clear templates and standards upfront

**Prevention rule:** Always use templates from `.agents/a-docs/templates/`

**Guardrail:** Template files include footer referencing their source path

### 2026-02-23 - Task marker format
**Context:** Task markers were inconsistent in documentation

**Lesson:** All task markers must follow `- [X]` format consistently

**Prevention rule:** Always use `- [ ]`, `- [/]`, `- [%]`, `- [!]`, `- [>]`, `- [x]` - never omit the `-` prefix

**Guardrail:** Templates and AGENTS.md aligned to use consistent format

---

## Prevention rules

1. **Always search before acting** - Never guess commands or patterns
2. **Use templates** - Never create ad-hoc formats
3. **Verify before done** - Evidence is mandatory
4. **Small diffs** - Keep changes reviewable
5. **No secrets** - Never commit credentials
6. **Consistent markers** - Always use `- [X]` format for task markers

## Guardrails

- YAML frontmatter required on all `.md` files
- UTC timestamps with Z suffix
- Workbench naming convention enforced
- Templates reference themselves in footer
- Task markers always include `-` prefix

---
*Lessons: `.agents/a-docs/lessons/general-lessons.md`*
