---
doc_type: lesson_entry
id: lesson_20260223_1935_cli-doc-command-parity
status: active
created_at: '2026-02-23T22:35:00Z'
updated_at: '2026-06-20T00:00:00-03:00'
source: user_correction
---

# Lesson: Keep CLI Wrapper and Docs in Parity

## Correction

Documentation referenced commands that the public CLI did not implement.

## Prevention Rule

Whenever a command is documented in README or agentic docs, verify that `afol`
or the documented project-local command exposes the exact command path and
arguments.

## Guardrail

Add a command-parity smoke check to CI that:

- parses documented `afol <command>` examples from README and canonical docs
- runs each command with `--help` or a safe subcommand
- fails if any documented command is not recognized
