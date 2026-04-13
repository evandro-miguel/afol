---
doc_type: lesson_entry
id: 20260413_1451_runtime_root_mirrors_must_stay_minimal
status: active
created_at: '2026-04-13T14:51:00-03:00'
updated_at: '2026-04-13T14:51:55-03:00'
tags:
- scaffold
- runtime
- mirrors
---

# 2026-04-13 - Runtime root mirrors must stay minimal

## Context

The scaffold still committed root mirrors and adapter folders for runtimes that
now use `AGENTS.md` directly or global host configuration.

## Lesson

Do not keep per-runtime root mirrors or adapter folders just because older
runtime contracts needed them. The committed root contract should stay minimal.

## Prevention Rule

Keep `AGENTS.md` as the canonical instruction source and `CLAUDE.md` as the
only committed mirror unless a future runtime has a current, proved need for a
repo-local file.

## Guardrail

Maintain tests that assert bootstrap does not export `OPENCODE.md`, `QWEN.md`,
`GEMINI.md`, `opencode.json`, `.opencode/`, `.qwen/`, `.gemini/`, or `.codex/`.
