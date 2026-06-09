---
doc_type: lesson_entry
id: 20260609_0800_session-scoped-evidence-lookup
status: active
created_at: '2026-06-09T08:00:00-03:00'
updated_at: '2026-06-09T08:00:00-03:00'
tags: [workbench, evidence, closure]
---

# Session-Scoped Evidence Lookup

## Context

Across multiple workbench sessions (F-04 smoke, global strict evidence repair,
command-parity hardening), root-level strict verification produced false
positives because task IDs (T-01, T-02…) repeat across sessions. Evidence
lookup that searched globally by task ID returned evidence from the wrong
session.

## Lesson

Evidence lookup must always resolve per-session ledger using the session folder
path. Task IDs are not globally unique. Root-level strict verification needs
session-scoped evidence caches.

## Prevention

- Always include session folder path when querying evidence.
- Never assume global task-ID uniqueness.
- Root strict verifiers must namespace by session.
