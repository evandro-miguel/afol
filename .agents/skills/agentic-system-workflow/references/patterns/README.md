---
description: Patterns for checklists, agentic self-improvement, and templates
metadata:
  tags: "agentic-system, patterns, templates, checklists"
---

# Agentic System Patterns

This document covers detailed usage patterns and conventions enforced in the `.agents/` workflows.

## 1. Task Checklist States

When utilizing the `task` template (`<theme>_task_{NN}.md`), strictly adhere to these state markers for each item to show progress:

- `- [ ]` : Not started
- `- [/]` : In progress
- `- [%]` : Blocked / Paused / Waiting
- `- [!]` : Failed / Error
- `- [>]` : Migrated / Moved elsewhere
- `- [x]` : Completed

## 2. Using Task Identifiers

Each task must have an ID:
```markdown
- [ ] T-01 First task
- [/] T-02 Wait for testing
```

These task IDs (`T-01`, `T-02`) should be referenced consistently across other files in the same workstream (e.g., in `<theme>_log_{NN}.md` and `<theme>_report_{NN}.md`).

## 3. Self-Improvement Loop & Lessons

To prevent repeated mistakes, strict lesson logging is enforced:

If a user sends a correction or you experience a process failure:
1. Create a **Lesson** file under `.agents/a-docs/lessons/entries/`.
2. Format the filename as `YYYYMMDD_HHMM_<slug>.md` (e.g., `20240224_1030_npm_install_failure.md`).
3. Add a prevention rule to avoid the same mistake.
4. If feasible, set up a guardrail (e.g., test, assertion, lint rule).
5. Review existing relevant lessons before undertaking a significant task.

## 4. Verification Before Done

Before marking any task `- [x]`, you must:
1. Actually verify the change locally. Never assume standard functionality.
2. Gather proof via logs, command outputs, or E2E traces.
3. Compare actual vs intended behavior.
4. Save the evidence in the associated `<theme>_log_{NN}.md` or `<theme>_report_{NN}.md`.

## 5. Timestamps

YAML frontmatter timestamps must use ISO 8601, specifying timezones (`Z` or `+/-HH:MM` explicitly).
