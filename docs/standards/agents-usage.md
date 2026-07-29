---
doc_type: standard
id: agents-usage-standard
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-07-13T00:00:00Z'
---

# AFOL Agent Usage

## Overview

Use `afol` for every supported scaffold, workbench, validation, update,
evidence, and lifecycle operation.

`.agents/` is limited to static scaffold metadata (`config.json`,
`lock.json`, `manifest.json`) and provider skills under `.agents/skills/**`.
Hooks, rules, source seeds, workbench state, and other mutable state belong
under `.afol/**`. It is not the operational command system.

## Quick Start

```bash
afol --help
afol status
afol validate project
afol new auth-refactor --feature-id F-01 --parent-spec <spec-id>
afol start --session <session-id> --task-id T-01
afol done --session <session-id> --task-id T-01 --test-shell "afol validate project"
afol close --session <session-id> --summary "Validation passed"
```

When the active/bound session is unambiguous, use the low-token path:

```bash
afol st T-01
afol d T-01 -x "afol validate project"
afol c -m "Validation passed"
```

For multiple execution-policy tasks covered by the same observed check, use a
compact range. AFOL executes the check once and records distinct evidence for
each task:

```bash
afol st T-01..T-10
afol d T-01..T-10 -x "afol validate project"
```

`d -x` executes an argv command without shell parsing. Use
`afol done --test-shell "<shell expression>"` explicitly for `&&`, pipes,
redirection, or other shell syntax.

## Command Reference

Use `docs/afol-runtime-reference.md` and `afol --help` for the maintained
command surface.

## Workbench Contract

- Create or target a session before product edits.
- Move the executable task to `in_progress` before editing.
- Complete tasks with observed exit-zero evidence (`done --test-shell` or
  `d -x`). Declared `evidence --result passed` alone cannot authorize `done`.
- Close sessions only after validation evidence exists.
- Keep factory workbench state out of downstream template payloads.
- Store mutable execution state under `.afol/wb/**`, not `.agents/wb/**`.

## Configuration

Project runtime behavior is described by `AGENTS.md`, `.afol/config.json`,
`.afol/**`, and the exportable scaffold under `src/project-template/`. Runtime
caches, active-session pointers, telemetry event streams, and factory evidence
are not template payload.
