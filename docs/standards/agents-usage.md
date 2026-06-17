---
doc_type: standard
id: agents-usage-standard
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-06-07T12:30:00-03:00'
---

# AFOL Agent Usage

## Overview

Use `afol` for every supported scaffold, workbench, validation, update,
evidence, and lifecycle operation.

`.agents/` is static scaffold metadata, rules, source seed, and provider skill
content. It is not the operational command system.

## Quick Start

```bash
afol --help
afol status
afol validate project
afol new auth-refactor --feature-id F-01 --parent-spec <spec-id>
afol start --session <session-id> --task-id T-01
afol evidence --session <session-id> --task-id T-01 --command "afol validate project" --result passed
afol done --session <session-id> --task-id T-01
afol close --session <session-id>
```

## Command Reference

Use `docs/afol-runtime-reference.md` and `afol --help` for the maintained
command surface.

## Workbench Contract

- Create or target a session before product edits.
- Move the executable task to `in_progress` before editing.
- Record task-scoped evidence before marking the task done.
- Close sessions only after validation evidence exists.
- Keep factory workbench state out of downstream template payloads.
- Store mutable execution state under `.afol/wb/**`, not `.agents/wb/**`.

## Configuration

Project runtime behavior is described by `AGENTS.md`, `.agents/config.json`,
`.afol/**`, and the exportable scaffold under `src/project-template/`. Runtime
caches, active-session pointers, telemetry event streams, and factory evidence
are not template payload.
