---
doc_type: lesson_entry
id: lesson_20260223_1935_cli-doc-command-parity
status: active
created_at: '2026-02-23T22:35:00Z'
updated_at: '2026-02-23T19:35:10-03:00'
source: user_correction
---

# Lesson: Keep CLI Wrapper and Docs in Parity

## Correction

Documentation referenced `.agents/agents telemetry ...` and `.agents/agents patterns ...`, but the wrapper did not implement these commands.

## Prevention Rule

Whenever a command is documented in README or agentic docs, verify that the wrapper exposes the exact command path and arguments.

## Guardrail

Add a command-parity smoke check to CI that:
- parses documented `.agents/agents <command>` examples from README
- runs each command with `--help` or a safe subcommand
- fails if any documented command is not recognized
