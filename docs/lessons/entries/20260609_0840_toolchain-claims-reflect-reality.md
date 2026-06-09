---
doc_type: lesson_entry
id: 20260609_0840_toolchain-claims-reflect-reality
status: active
created_at: '2026-06-09T08:40:00-03:00'
updated_at: '2026-06-09T08:40:00-03:00'
tags: [docs, toolchain, accuracy]
---

# Toolchain Claims Must Reflect Live Behavior, Not Aspirational State

## Context

During bun-ts-ultimate-direction-docs and script-health-ts7-fix sessions, docs
and scripts contained claims about installed tooling (TS7, linters) that were
directional or informational, not verified in the current environment.

## Lesson

Keep toolchain/version claims informational until installation evidence exists.
Docs must reflect live behavior, not aspirational stack state. Future-version
notes need careful wording and explicit gate coverage.

## Prevention

- Mark toolchain claims as informational/direction-only until verified.
- Do not present planned upgrades as current state in docs.
- Verify tool availability before claiming it in release gates.
