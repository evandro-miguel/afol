---
description: Workbench-focused automation tools and commands commonly used in richer .agents scaffolds.
metadata:
  tags: "workbench, tools, automation, wb-update, verify-tasks, session"
---

# Workbench Tools

Use repository automation when it exists instead of hand-editing session state.

## Discovery

- `.agents/agents tools list`
- `.agents/agents tools info <tool-id>`
- Source catalog: `.agents/tools.json`

Use discovery first when you are unsure which workbench command owns a behavior.

## Core Session Commands

- `.agents/agents new <theme> [...]`
  - Creates a governed workstream and usually updates `.agents/wb/.active_session`
- `.agents/agents status`
  - Shows session status and resolved artifact pointers
- `.agents/agents session catchup`
  - Summarizes current session state for resuming work
- `.agents/agents session close`
  - Closes a governed session with lifecycle-aware summaries

## Workbench Automation

- `.agents/agents wb-update touch`
- `.agents/agents wb-update task <task-id> --mark-done`
- `.agents/agents wb-update status --value <status>`
- `.agents/agents wb-update timeline --message "<message>"`
- `.agents/agents wb-update link <key> <value>`
- `.agents/agents wb-update files-changed`
- `.agents/agents wb-update evidence "<summary>"`

Prefer explicit `--session <session-id>` when more than one session is active.

## Verification and Review

- `.agents/agents verify-tasks <session-or-root>`
- `.agents/agents verify-tasks --strict <session-or-root>`
- `.agents/agents review <session>`
- `make lint`
- `make doctor`

Use `verify-tasks` before closure. Use repo-specific lint/doctor/review commands when the scaffold provides stronger guarantees than manual inspection.

## Knowledge and Reuse

- `.agents/agents knowledge list|search|pull|show`

Use the knowledge flow before re-reading large historical workbench docs when the topic may already have prior findings.

## Notes

- Some scaffolds expose the same operations through `make` aliases such as `make new`, `make quick`, `make wb-touch`, `make wb-evidence`, `make wb-task`, `make wb-status`, `make wb-files-changed`, and `make verify-strict`.
- If the scaffold documents `updated_at` automation, do not update that field manually.
