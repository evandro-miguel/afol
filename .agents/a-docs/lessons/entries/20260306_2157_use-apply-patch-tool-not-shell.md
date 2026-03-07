---
doc_type: lesson_entry
id: lesson_20260306_2157_use_apply_patch_tool_not_shell
status: active
created_at: '2026-03-06T21:57:00Z'
updated_at: '2026-03-06T18:59:32-03:00'
source: user_correction
related_session: 260306_1815_roadmap-first-governance
---

# Lesson: Use `apply_patch` Tool, Not Shell Patch Wrappers

## Correction

Patch edits were attempted through shell execution, and the user explicitly corrected that flow.

## Prevention Rule

- When a change is best expressed as a patch, use the dedicated `apply_patch` tool directly.
- Do not send patch payloads through `exec_command`.
- Use shell commands for inspection, validation, and generators, not for patch transport.

## Guardrail

- Before editing, choose one of these paths:
  - `apply_patch` for direct file patches
  - `exec_command` for commands such as `sed`, `rg`, `make`, `uv`, or formatter/test runners
- If the intended shell command contains patch headers such as `*** Begin Patch`, stop and switch to `apply_patch`.

## Expected Behavior

- File edits remain traceable and tool-compliant.
- Shell execution is reserved for commands that actually need a shell.
