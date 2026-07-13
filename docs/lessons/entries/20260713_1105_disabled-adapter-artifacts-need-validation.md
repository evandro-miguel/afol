---
doc_type: lesson_entry
id: 20260713_1105_disabled-adapter-artifacts-need-validation
status: active
created_at: '2026-07-13T11:05:25-03:00'
updated_at: '2026-07-13T11:05:25-03:00'
tags: [adapters, validation, gitnexus, provider-artifacts]
---

# Disabled Adapter Artifacts Need A Validation Gate

## Context

Running GitNexus with provider-context injection recreated
`.claude/skills/gitnexus/**` while `.afol/config.json` kept the Claude adapter
disabled. `afol adapter list` exposed the mismatch, but project validation did
not consume adapter state, so the normal structural gate returned a false
green.

## Lesson

Configuration intent and owned artifacts must be validated together. A command
that reports drift is not a quality gate unless the standard validation path
fails on the same condition. Repository indexing must use an index-only mode
when provider adapters are disabled.

## Prevention

- Fail project validation when a disabled adapter still owns files.
- Reindex with `gitnexus analyze --index-only --no-stats`.
- Use the globally installed `gitnexus`; never introduce package-manager
  fallbacks in project instructions.
- After tooling that can inject provider context, verify adapter state and the
  project validation result.
