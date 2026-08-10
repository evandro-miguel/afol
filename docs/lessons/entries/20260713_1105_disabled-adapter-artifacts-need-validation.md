---
doc_type: lesson_entry
id: 20260713_1105_disabled-adapter-artifacts-need-validation
status: active
created_at: '2026-07-13T11:05:25-03:00'
updated_at: '2026-07-13T11:05:25-03:00'
tags: [adapters, validation, gitnexus, provider-artifacts]
---

# Disabled Adapter Artifacts Need A Validation Gate

## Supersession

The GitNexus-specific commands and installation guidance below are historical
incident context. Current semantic repository navigation uses the
`evandro-rag-system` route and `ragctl` Project RAG only.

## Context

A historical GitNexus run with provider-context injection recreated
`.claude/skills/gitnexus/**` while `.afol/config.json` kept the Claude adapter
disabled. `afol adapter list` exposed the mismatch, but project validation did
not consume adapter state, so the normal structural gate returned a false
green.

## Lesson

Configuration intent and owned artifacts must be validated together. A command
that reports drift is not a quality gate unless the standard validation path
fails on the same condition. During that incident, repository indexing needed
an index-only mode while provider adapters were disabled.

## Prevention

- Fail project validation when a disabled adapter still owns files.
- Verify the registered Project RAG index with `ragctl` before semantic
  retrieval, then confirm implementation facts with focused local reads.
- After tooling that can inject provider context, verify adapter state and the
  project validation result.
