---
doc_type: standard
id: agents-usage-standard
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-06-07T12:30:00-03:00'
---

# Agents System Usage

## Overview

This document describes the current `.agents/` operational system from the
public command surface. Use `afol` for factory and downstream workflows.

Legacy Python wrappers and legacy just command runners are migration debt. Do
not document them as the normal path unless the task explicitly targets
compatibility retirement.

## Quick Start

```bash
afol --help
afol status
afol validate
afol new auth-refactor --feature-id F-01 --parent-spec <spec-id>
afol start --task-id T-01
afol evidence T-01 --command "afol validate" --result passed
afol done --task-id T-01 --test "afol validate"
afol close
```

## Command Reference

Use `docs/standards/scripts-reference.md` for the maintained command list.

## Workbench Contract

- Create or target a session before product edits.
- Move the executable task to `in_progress` before editing.
- Record task-scoped evidence before marking the task done.
- Close sessions only after validation evidence exists.
- Keep factory workbench state out of downstream template payloads.

## Configuration

Project runtime behavior is described by `AGENTS.md`, `.agents/config.json`,
and the exportable scaffold under `src/project-template/`. Runtime caches,
active-session pointers, telemetry event streams, and factory evidence are not
template payload.
