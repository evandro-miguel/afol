---
doc_type: lesson_entry
id: "20260907_2248_confirm-skill-audit-target"
status: active
created_at: "2026-09-07T22:48:00Z"
updated_at: "2026-09-07T22:48:00Z"
tags: ["skills", "scope", "verification"]
---

# 2026-09-07 - Resolve the exact skill before expanding an audit

## Context

A broad project skill audit missed the intended target. The user clarified that
the requested review, changes, and execution tests concern `evandro-rag-system`.

## Lesson

The project location does not establish which skill the user wants evaluated.

## Prevention Rule

Resolve the named capability to its installed skill and canonical source before
testing. Keep hypotheses, edits, and behavioral comparisons on that target.

## Guardrail

Record the target skill path and baseline digest in the evaluation evidence.
Tests of unrelated skills cannot establish the target skill's quality.
