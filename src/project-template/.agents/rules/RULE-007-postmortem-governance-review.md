---
id: RULE-007
theme: postmortem-governance-review
version: 1.0
created: 2026-05-15
updated_at: '2026-05-15T14:35:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Postmortem Governance Review

**Purpose:** Keep closure reviews grounded in the governed workstream and its evidence.

---

## When It Applies

- Any postmortem, closure review, or final handoff that references a governed session.
- Any handoff that claims completion while workbench evidence, task state, or report status is still open.

## Required Review

- Confirm the task board is complete or explicitly moved.
- Confirm validation evidence exists for the closure claim.
- Confirm the session report, if present, reflects the final state.
- Confirm the active session pointer is not being used as a stale completion signal.

## Review Outcomes

- `pass`: the closure claim is supported by evidence and task state.
- `needs-follow-up`: the session still has unresolved work, missing evidence, or stale state.

## References

- `docs/standards/verification.md`
- `docs/agentic/verify-tasks.md`
- RULE-004 - Validation & Linting

---

*Version: 1.0 | Lines: ~40 | Max: 250*
