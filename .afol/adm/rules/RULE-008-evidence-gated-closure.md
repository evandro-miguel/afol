---
doc_type: rule
id: RULE-008
theme: evidence-gated-closure
version: 1.0
created: 2026-06-09
updated_at: '2026-06-09T07:30:00-03:00'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Evidence-Gated Closure

**Purpose:** Ensure workbench tasks close only when concrete evidence exists —
never by state-board claims alone.

---

## When This Rule Applies

Apply this rule whenever a workbench task transitions to `done` or `closed`.

This rule complements:

- `RULE-002` for governed workstream creation and closure flow
- `RULE-004` for executable validation before completion
- `RULE-007` for postmortem governance review

---

## Evidence Requirements

Before marking any task `done`:

1. Evidence must exist as a file artifact (`.evidence.jsonl` entry, report
   section, or test output) — not as a chat-only claim.
2. Evidence must be session-scoped: task IDs repeat across sessions, so evidence
   lookup must resolve per-session ledger, not globally by task ID.
3. Benchmark task completion requires final artifact proof (plan/task/report/evidence
   files), not just a success JSON.
4. Child benchmark tasks must prove fixture-local provenance and reject shared/global
   evidence.
5. If evidence is missing or placeholder, the task stays `in_progress` with a blocker
   note.

---

## Session-Scoped Evidence

Because task IDs (T-01, T-02...) repeat across sessions:

- Evidence lookup must always include the session folder path.
- Root-level strict verification must resolve evidence per-session ledger.
- Never assume global task-ID uniqueness.

---

## Benchmark-Specific Requirements

For benchmark sessions:

- Hard-run acceptance must include final artifact inspection plus tool-call/accounting
  logs.
- Self-reported benchmark success without final artifact proof is invalid.
- Benchmark providers must include rate-accounting tests and configured caps.
- New benchmark providers must begin with a config + implementation-plan artifact
  stating runtime, model, and caps.

---

## Validation

Before reporting task completion:

- `afol verify-tasks --strict <session>` must report no missing evidence.
- Evidence ledger entries must point to real files, not placeholder paths.
- If a sidecar artifact is `not_required`, the justification must be explicit.

---

## Best Practices

**DO:**

- ✅ Create evidence artifacts before marking tasks done.
- ✅ Scope evidence by session folder, not by global task ID.
- ✅ Include tool-call logs and rate accounting for benchmark evidence.

**DON'T:**

- ❌ Mark tasks done based on chat claims without file evidence.
- ❌ Accept global evidence for child benchmark tasks.
- ❌ Close sessions with placeholder evidence paths.

---

## References

- RULE-002 - Workstream Creation
- RULE-004 - Validation & Linting
- RULE-007 - Postmortem Governance Review
- `.afol/wb/` session structure

---

*Version: 1.0 | Lines: ~90 | Max: 250*
