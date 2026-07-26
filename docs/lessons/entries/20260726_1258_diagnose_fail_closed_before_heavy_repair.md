---
doc_type: lesson_entry
id: 20260726_1258_diagnose_fail_closed_before_heavy_repair
status: active
created_at: '2026-07-26T15:58:54.000Z'
updated_at: '2026-07-26T15:58:54.000Z'
tags:
- process
- safety
- context
- degraded-host
---

# 2026-07-26 - Diagnose and Fail Closed Before Heavy Repair

## Context

The user warned that the system had broken and asked for a cautious repair.
The canonical administration tree contained substantial governance context,
while the active section index silently read a retired path and could appear
healthy with zero sections.

## Lesson

A degraded system is not a reason to run hydrate, coverage, release, benchmark,
cleanup, or restart operations first. Establish the smallest authoritative
failure, protect canonical state, and make health fail closed before expanding
validation.

## Prevention Rule

- Diagnose canonical source paths and downstream consumers before mutation.
- Add and run a focused failing regression before production repair.
- Treat empty derived state as healthy only when its canonical source set is
  also empty.
- Avoid hydrate and heavyweight gates until focused trust-boundary checks pass.

## Guardrail

Focused context and health tests must prove canonical source coverage,
freshness, and fail-closed empty-index behavior before any later hydrate or
release lane proceeds.
