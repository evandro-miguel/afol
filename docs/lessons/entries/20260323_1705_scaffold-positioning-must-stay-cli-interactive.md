---
doc_type: lesson_entry
id: 20260323_1705_scaffold-positioning-must-stay-cli-interactive
status: active
created_at: "2026-03-23T17:05:00Z"
updated_at: "2026-03-23T17:05:00Z"
---

# Lesson: Scaffold positioning must stay interactive CLI-first

## Trigger

- The scaffold was being analyzed with too much emphasis on SDK/runtime patterns from external agent frameworks, while the actual product scope is an operating system for agents that run interactively in terminal-first CLIs such as Codex CLI, OpenCode, Gemini CLI, and Claude Code.

## What Went Wrong

- The system framing was too broad and risked drifting toward an embedded agent SDK mental model instead of an interactive runtime adapter and governance layer.

## Prevention Rule

- Before proposing structural changes, restate whether the scaffold is targeting interactive CLI agents or embedded/service runtimes, and bias design decisions toward the interactive CLI path unless the roadmap explicitly says otherwise.

## Guardrail

- Keep `AGENTS.md`, exported templates, and onboarding docs explicit that the scaffold is CLI-interactive-first.
- Reject architecture proposals that add SDK/server complexity without a stated roadmap need.
