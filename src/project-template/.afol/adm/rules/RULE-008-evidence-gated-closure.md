---
doc_type: rule
id: RULE-008
theme: evidence-gated-closure
version: 1.1
created: 2026-06-09
updated_at: '2026-06-20T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Evidence-Gated Closure

**Purpose:** workbench tasks close only with concrete evidence.

## Applies When

Use this rule whenever a workbench task moves to `done` or a session closes.

## Requirements

- Evidence must exist as file-backed artifact: evidence ledger, report section,
  or test output. Chat claims are not enough.
- Evidence lookup must be session-scoped because task IDs repeat.
- Benchmark completion requires final artifact proof, not only success JSON.
- Child benchmark tasks must prove fixture-local provenance and reject
  shared/global evidence.
- Missing or placeholder evidence keeps the task in progress with a blocker.

## Validation

```bash
afol verify-tasks --strict <session>
```

Evidence ledger entries must point to real files. If a sidecar is
`not_required`, its justification must be explicit.

## References

- RULE-002 - Workstream Creation
- RULE-004 - Validation and Linting
- RULE-007 - Postmortem Governance Review
