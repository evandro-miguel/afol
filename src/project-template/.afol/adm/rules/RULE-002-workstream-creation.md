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
Canonical code, product docs, reusable specs, and governance stay at project
locations. AFOL-managed plan/task/log/report/evidence-ledger files keep their
session-root paths. Put needed supplementary artifacts in
`<session>/artifacts/` with distinct task-purpose names and exclusive creation;
never overwrite. A closed-session review appends a new artifact there while
preserving original records and closure. New implementation uses a linked open
continuation. Caches, builds, and fixtures may use disposable scratch; retained
acceptance logs/results belong to the session. No-session work keeps durable
outputs at canonical project locations.

Avoid habitual sessions for quick asks, read-only checks, planning-only replies,
or broad context gathering. Do not create sidecars or harness handoff packs by
habit; the session plan/task/log is the handoff. Create brainstorm, research,
explorer-check, or postmortem artifacts only when requested, required, or the
smallest blocking proof. Link primary artifacts; record sidecars in `sidecar_justification`
and use `not_required` when skipped. Discover first. Use decision intake for ambiguous, product-shaped, or
benchmark-heavy work. Feature changes update
affected local skills/docs; record required shared-skill propagation. Finalize optional artifacts before close, run
the narrowest meaningful check, and require task-scoped evidence before done.

Use the given roadmap feature, parent spec, or child spec directly. Governed
flow is `n` -> `st` -> edit -> `d -x` -> `c`; evidence is diagnostic and never
authorizes done. Task state lives in `State Board` rows mutated by AFOL
commands, never in `- [ ]` markers.
