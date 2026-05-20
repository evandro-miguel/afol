---
doc_type: standard
id: readme
theme: lessons
status: active
created_at: '2026-05-05T11:44:41+00:00'
updated_at: '2026-05-05T11:44:41+00:00'
---

# Lessons

This folder contains lessons learned and prevention rules.

## Purpose

Capture learnings from user corrections and project experiences to prevent repeating mistakes.

## Structure

```text
lessons/
├── entries/                                # One lesson per file (mandatory)
│   ├── YYYYMMDD_HHMM_<slug>.md
│   └── README.md
├── general-lessons.md                      # Legacy aggregated lessons (historical)
└── README.md
```

## When to update

Update lessons when:

- User corrects agent behavior
- A mistake is repeated
- A new guardrail is identified
- A better pattern is discovered

Mandatory format:

- One lesson = one file in `docs/lessons/entries/`

## Lesson format (per-file)

Use frontmatter + sections:

```markdown
---
doc_type: lesson_entry
id: "YYYYMMDD_HHMM_<slug>"
status: active
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
tags: ["process", "quality"]
---

# YYYY-MM-DD - <short title>

## Context

<situation where this occurred>

## Lesson

<what was learned>

## Prevention Rule

<actionable rule to prevent recurrence>

## Guardrail

<automated check if feasible>
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

- See `docs/lessons/entries/YYYYMMDD_HHMM_<slug>.md`
```

---

*Lessons folder: `docs/lessons/`*
