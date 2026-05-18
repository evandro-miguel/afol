---
doc_type: lesson_entry
id: lesson_20260416_2210_runtime_update_wrappers_must_route_direct_commands
status: active
created_at: '2026-04-16T22:10:00-03:00'
updated_at: '2026-04-16T22:10:00-03:00'
source: user_correction
workstream_ref: 260416_1922_update-safe-adoption-mcp-first
tags:
- scaffold
- runtime
- wrapper
- adoption
---

# Lesson: Runtime Update Wrappers Must Route Direct Commands

## Correction

The runtime wrapper initially sent unknown commands through the script registry
fallback. That made new runtime-native commands such as `adoption-plan` and
`inspect-target` take the wrong path even though the runtime service already
exposed them.

## Prevention Rule

- When a command exists as a runtime-native CLI surface, route it directly to
  the runtime entrypoint instead of forcing it through the script registry.
- Keep script registry fallback for compatibility commands only.
- Do not let newly added runtime commands depend on an older script adapter if
  the runtime already owns the behavior.

## Guardrail

- Wrapper tests must assert that runtime-native adoption commands invoke
  `agentic <command>` directly.
- Keep a compatibility test that still exercises the script-registry path for
  legacy commands.

## Expected Behavior

- Operators can call runtime-native adoption commands through the wrapper
  without passing through `agentic run <command>`.
- The script fallback remains available for registry-backed commands and old
  compatibility surfaces.
