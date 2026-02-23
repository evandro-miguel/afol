# Lessons

This folder contains lessons learned and prevention rules.

## Purpose

Capture learnings from user corrections and project experiences to prevent repeating mistakes.

## Structure

```
lessons/
├── general-lessons.md    # Core lessons for the project
├── <session-id>-lessons.md  # Session-specific lessons (optional)
└── README.md             # This file
```

## When to update

Update lessons when:
- User corrects agent behavior
- A mistake is repeated
- A new guardrail is identified
- A better pattern is discovered

## Lesson format

```markdown
### YYYY-MM-DD - <short title>
**Context:** <situation where this occurred>

**Lesson:** <what was learned>

**Prevention rule:** <actionable rule to prevent recurrence>

**Guardrail:** <automated check if feasible>
```

## Prevention rules

Rules should be:
- **Actionable** - Clear what to do/not do
- **Specific** - Not vague or generic
- **Enforceable** - Can be checked or automated

## Guardrails

Guardrails are automated checks:
- Lint rules
- Test assertions
- CI/CD checks
- Template requirements
- Validation scripts

## Linking to work

Reports should reference lessons:
```markdown
## Lessons (if any)
- See lessons/general-lessons.md#task-marker-format
```

---
*Lessons folder: `.agents/a-docs/lessons/`*
