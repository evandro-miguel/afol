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

Create governed work only for execution, evidence, or durable decisions. Do not create a session for a quick answer, read-only check, planning-only reply, or broad context gathering.

Sessions are optional for ordinary work. Without one, durable outputs stay at canonical project locations. With a session, keep reports, handoffs, reviews, plans, and durable evidence under that session in configured `paths.wb_dir`, never `paths.tmp_dir`. Managed plan/task/log/report/evidence-ledger files keep their defined session-root paths. Put needed supplementary artifacts in `<session>/artifacts/` with distinct task-purpose names and exclusive creation; never overwrite. A closed-session review appends there without changing original records or closure. New implementation uses a linked open continuation. Caches, builds, and fixtures may use disposable scratch; retained acceptance logs and results belong to the session.

Do not create sidecars or harness handoff packs by habit; the session plan and task are the handoff. Create research, brainstorm, explorer-check, report, spec, or postmortem artifacts only when requested, required, or needed as the smallest blocking proof. Link primary artifacts, list optional sidecars, and explain them with `sidecar_justification`; use `not_required` when none are needed. Discover before planning; plans describe direct execution rather than meta-planning.

Use the given roadmap feature, parent spec, or child spec directly. For ambiguous, product-shaped, or benchmark-heavy work, run the smallest useful decision-intake step before benchmarking or planning. Feature changes update affected local skills and docs; record any required shared-skill propagation follow-up.

Governed implementation follows `afol n` -> `afol st` -> edit -> verify -> `afol d -x` -> `afol c`. Bind a real implementation session to its feature and spec. Evidence is diagnostic; it does not authorize completion. No task closes without task-scoped evidence, and task state lives in State Board rows changed by AFOL commands, never Markdown checkbox markers. Finalize optional artifacts before closing.

Before completion, run the narrowest meaningful check, record its evidence against the task, and verify tasks strictly when closing a governed session.

## References

- RULE-003 - Documentation Standards
- RULE-004 - Validation and Linting
- RULE-006 - Applicable Rule Resolution
