---
doc_type: rule
id: RULE-002
theme: workstream-creation
version: 1.2
created: 2026-02-23
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
updated_at: '2026-09-25T00:00:00Z'
---

# Workstream Creation

Sessions are optional for ordinary work. If a session is associated with a
task, keep its reports, handoffs, reviews, plans, and durable evidence under
that session in configured `paths.wb_dir`; never retain them in `paths.tmp_dir`.
Canonical code, product docs, reusable specs, and governance stay in their
project locations. AFOL-managed plan/task/log/report/evidence-ledger files keep
their defined session-root paths. Put needed supplementary artifacts in
`<session>/artifacts/` with distinct task-purpose names and exclusive creation;
never overwrite. A closed-session review appends a new artifact there while
preserving original records and closure. New implementation uses a linked open
continuation. Caches, builds, and fixtures may use disposable scratch; retained
acceptance logs/results belong to the session. No-session work keeps durable
outputs at canonical project locations.

Use the given roadmap feature, parent spec, or child spec directly. Governed
flow is `n` -> `st` -> edit -> `d -x` -> `c`; evidence is diagnostic and never
authorizes done. Task state lives in `State Board` rows mutated by AFOL
commands, never in `- [ ]` markers. No task closes without task-scoped evidence.
