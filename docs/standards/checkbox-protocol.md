---
doc_type: standard
id: "000000_000000_checkbox-protocol_standard_01"
status: active
created_at: 2026-02-23T00:00:00Z
updated_at: 2026-02-23T00:00:00Z
title: "Checkbox Protocol Standard"
---

## Checkbox Protocol

This document defines the standard checklist markers used across agent
documentation for planning notes, acceptance lists, and non-lifecycle progress
tracking.

Workbench `T-xx` lifecycle state is not stored in parallel Task List
checkboxes. In workbench task files, the source of truth is the `State Board`
table, and lifecycle changes must go through AFOL commands such as
`afol start`, `afol evidence`, `afol done`, `afol close`, and
`afol verify-tasks --strict`.

### State Markers

| Marker | Canonical State | Meaning | Required Notes |
|--------|-----------------|---------|-----------------|
| `- [ ]` | `pending` | Task not started | None |
| `- [/]` | `in_progress` | Work is actively underway | Current execution evidence |
| `- [!]` | `problem` | A real blocker or issue exists | Problem note or blocks file |
| `- [>]` | `moved` | Task is deferred to a later plan/session | Destination and reason |
| `- [%]` | `implemented_untested` | Implementation is in place but validation has not run yet | Validation evidence pending |
| `- [&]` | `tested_needs_spec_validation` | Runtime validation passed, but spec/UX/acceptance validation is still pending | Spec validation evidence pending |
| `- [x]` | `done` | Fully finished | Validation evidence, or explicit `N/A` when validation does not apply |

### Marker Authorization Rules

| Marker | Who can set | Requires log |
|--------|-------------|--------------|
| `- [ ]` | Anyone | No |
| `- [/]` | Agent | No |
| `- [!]` | Agent | Yes (blocks file or problem note) |
| `- [>]` | Agent or user | Yes (mandatory destination + reason) |
| `- [%]` | Agent | Yes when validation is still pending |
| `- [&]` | Agent | Yes when spec validation is still pending |
| `- [x]` | Agent | Yes when evidence or explicit `N/A` is recorded |

#### Fallback for Unsupported Tools

If a tool cannot parse the canonical markers, it must fall back to the
matching `state:` value in the State Board and preserve any required notes:

- `pending`
- `in_progress`
- `problem`
- `moved`
- `implemented_untested`
- `tested_needs_spec_validation`
- `done`

### Blocked Tasks Protocol

When marking a task with `- [!]`:

1. Create `<task-id>-blocks.md` in the same session folder
2. Document the problem, errors, and context
3. Propose next steps or workarounds
4. Link the blocks file in the Notes column

See: `docs/templates/blocks.md`

### Moved Tasks Protocol

When a task is marked with `- [>]`:

1. Record the destination plan/session in the Notes column
2. Record the reason for the deferment in the Notes column
3. Create a log entry if the move changes the active execution path

---

*Standard: `docs/standards/checkbox-protocol.md`*
