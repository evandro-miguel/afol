---
doc_type: standard
id: file-first-chat-light_01
status: active
created: 2026-05-20T00:00:00-03:00
updated_at: '2026-05-20T00:00:00-03:00'
---

# File-First / Chat-Light Delegation Standard

## Purpose

Reduce response overhead for implementation work by standardizing concise,
artifact-centric coordination and explicit sidecar justification.

## Core Contract

- Touch only files scoped by the user request.
- Keep the working record in file artifacts and structured field blocks.
- Sidecars (`brainstorm`, `research`, `explorer-check`, `postmortem`) are optional;
  they must be justified whenever referenced.
- If a sidecar is skipped, record `not_required` in the corresponding
  justification field.

## Artifact Output Fields (Required)

All `plan`, `task`, and `report` family artifacts must include explicit artifact
fields:

- `output_artifacts.primary` for the artifact itself and mandatory linked artifacts.
- `output_artifacts.sidecars` for `brainstorm`, `research`,
  `explorer_check`, and `postmortem`.
- `sidecar_justification` for each optional artifact, including empty values.

## Compact Handoff Format

When the user asks for compact status or slice completion, the final response must
be exactly these fields:

```
STATUS: <DONE|BLOCKED|PARTIAL>
TASK: T-XX
FILES_WRITTEN:
- <path>: <change summary>
VALIDATION_OR_CHECKS:
- <check> -> <pass/fail/na>
SUMMARY:
- <short result summary>
BLOCKERS:
- <blocker or none>
NEXT:
- <next action or none>
```
