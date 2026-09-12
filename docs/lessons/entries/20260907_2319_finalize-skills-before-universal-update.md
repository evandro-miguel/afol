---
doc_type: lesson_entry
id: "20260907_2319_finalize-skills-before-universal-update"
status: active
created_at: "2026-09-07T23:19:00Z"
updated_at: "2026-09-07T23:19:00Z"
tags: ["skills", "publication", "verification"]
---

# 2026-09-07 - Finalize a skill before updating Universal Skills

## Context

The user clarified the delivery order after the RAG skill revision was written
into Universal Skills during its editing and testing cycle.

## Lesson

Universal Skills receives the finalized revision. Global updates originate from
that finalized canonical source.

## Prevention Rule

Prepare and test a candidate in task-local staging. Finish the skill edit and
its relevant checks before writing the revision into Universal Skills. Then run
the Universal validation flow and its scoped global update command.

## Guardrail

Check candidate validation evidence before publishing to Universal, and verify
the global update selects the finalized canonical skill. A shell working
directory change does not change the agent's filesystem authorization boundary.
