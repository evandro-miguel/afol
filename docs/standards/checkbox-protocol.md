---
doc_type: standard
id: "000000_000000_checkbox-protocol_standard_01"
status: active
created_at: 2026-02-23T00:00:00Z
updated_at: 2026-02-23T00:00:00Z
title: "Checkbox Protocol Standard"
---

# Checkbox Protocol

This document defines the standard checklist markers used across all agent documentation.

## State Markers

| Marker | Meaning | When to Use |
|--------|---------|-------------|
| `- [ ]` | Pending | Task not started |
| `- [/]` | In Progress | Currently working on |
| `- [%]` | Implemented, Not Tested | Ready for testing |
| `- [!]` | Blocked/Error | Cannot proceed (requires blocks file) |
| `- [>]` | Skipped | Skipped by user request (requires log entry) |
| `- [x]` | Done | Tested and verified |

## Marker Authorization Rules

| Marker | Who can set | Requires log |
|--------|-------------|--------------|
| `- [ ]` | Anyone | No |
| `- [/]` | Agent | No |
| `- [%]` | Agent | No |
| `- [!]` | Agent | Yes (blocks file) |
| `- [>]` | **User only** | **Yes (mandatory)** |
| `- [x]` | Agent | No |

**Agents MUST NOT set `- [>]` without explicit user authorization.**

### Fallback for Unsupported Tools

If a tool cannot parse `- [/]` or `- [%]`, it must fall back to:
- `- [ ]` with a `state: in_progress` or `ready_for_test` in the State Board.

## Blocked Tasks Protocol

When marking a task with `- [!]`:

1. Create `<task-id>-blocks.md` in the same session folder
2. Document the problem, errors, and context
3. Propose next steps or workarounds
4. Link the blocks file in the Notes column

See: `docs/templates/blocks.md`

## Skipped Tasks Protocol

When a task is marked with `- [>]`:

1. User must explicitly authorize the skip
2. Create a log entry documenting the skip reason
3. Record timestamp and authorization

---

*Standard: `docs/standards/checkbox-protocol.md`*
