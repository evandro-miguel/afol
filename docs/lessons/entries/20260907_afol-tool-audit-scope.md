---
doc_type: lesson_entry
id: "20260907_afol-tool-audit-scope"
status: active
created_at: "2026-09-07T23:58:00Z"
updated_at: "2026-09-07T23:58:00Z"
tags: ["scope", "tools", "verification"]
---

# Audit the project's tools when the request concerns project updates

## Context

The user requested an audit of tools after AFOL updates. The initial response tested the unrelated Agent Memory MCP runtime. The user clarified that the target was AFOL commands and newly developed project tools.

## Lesson

Resolve "tools here" against the active project and recent changes before expanding to session-wide integrations. An unanswered clarification does not justify a broad audit of an unrelated runtime.

## Prevention Rule

Start with the canonical AFOL checkout, command registry, changed files, and native test and benchmark contracts. Compare the same commands and accepted outcomes against a named baseline. Unrelated MCP health findings do not answer an AFOL regression question.
