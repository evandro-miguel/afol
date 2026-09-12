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

Happy path (omit `-S`/`--session` when an active or bound session resolves):

```bash
afol --help
afol s
afol v project
afol n auth-refactor -F F-01 -P <spec-id> -t "<task>"
afol st T-01
afol d T-01 -x "afol v project"
afol c -m "Validation passed"
```

Micro one-shot:

```bash
afol qt auth-refactor -t "<task>" -c "afol v project"
```

For multiple execution-policy tasks covered by the same observed check, use a
compact range. AFOL executes the check once and records distinct evidence for
each task:

```bash
afol st T-01..T-10
afol d T-01..T-10 -x "afol v project"
```

`e` is diagnostic only. Do not require `evidence` then `done` as two hops.
`d -x` executes an argv command without shell parsing. Use
`afol done --test-shell "<shell expression>"` explicitly for `&&`, pipes,
redirection, or other shell syntax. Long `--session` / `-S` forms remain
valid for CI and multi-agent work when the session is ambiguous.

## Command Reference

Use `docs/afol-runtime-reference.md` and `afol --help` for the maintained
command surface.

## Workbench Contract

- Create or target a session before product edits.
- Move the executable task to `in_progress` before editing.
- Complete tasks with observed exit-zero evidence (`d -x`). Declared
  `evidence --result passed` alone cannot authorize `done`.
- Close sessions only after validation evidence exists.
- Keep factory workbench state out of downstream template payloads.
- Store mutable execution state under `.afol/wb/**`, not `.agents/wb/**`.

## Configuration

Project runtime behavior is described by `AGENTS.md`, `.afol/config.json`,
`.afol/**`, and the exportable scaffold under `src/project-template/`. Runtime
caches, active-session pointers, telemetry event streams, and factory evidence
are not template payload.
