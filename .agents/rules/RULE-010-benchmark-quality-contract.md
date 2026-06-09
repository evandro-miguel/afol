---
doc_type: rule
id: RULE-010
theme: benchmark-quality-contract
version: 1.0
created: 2026-06-09
updated_at: '2026-06-09T07:30:00-03:00'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Benchmark Quality Contract

**Purpose:** Enforce evidence quality, isolation, and resource governance for
benchmark sessions.

---

## When This Rule Applies

Apply this rule to any benchmark, live-agent test, or performance measurement
session.

---

## Evidence Quality

Benchmark sessions must persist real artifact evidence before marking work done:

1. Plan, task, report, and evidence files must all exist at closure.
2. Self-reported success is invalid without final artifact proof.
3. Hard-run acceptance must include final artifact inspection plus
   tool-call and accounting logs.
4. Benchmark prompts must not spell out tool usage — the harness owns tool
   selection.
5. Each tool/progress event must be logged.

---

## Isolation and Provenance

- Child benchmark tasks must prove fixture-local provenance.
- Shared or global evidence is rejected for isolated benchmarks.
- When the target branch diverges, publish from an executor branch rather than
  force-pushing.

---

## Resource Governance

- Benchmark providers must include rate-accounting tests and configured caps.
- Token/request/RPM/RPD budgets must be explicit in the benchmark config.
- New benchmark providers must begin with a config + implementation-plan
  artifact stating runtime, model, and caps.
- Resource budget gates are mandatory, not optional.

---

## Session Lifecycle

- Benchmark lifecycle sessions should include explicit evidence schema and
  acceptance criteria in the plan.
- Catalog cleanup tasks must state the cleanup scope and expected artifact
  impact up front.
- Provider work should be planned before code changes begin.

---

## Validation

Before benchmark session closure:

- All plan/task/report/evidence artifacts exist.
- Rate accounting logs are present and within configured caps.
- Tool-call logs match the expected execution trace.
- `afol verify-tasks --strict <session>` reports no gaps.

---

## Best Practices

**DO:**

- ✅ Require final artifact inspection for hard runs.
- ✅ Log every tool/progress event explicitly.
- ✅ State resource budgets in the benchmark config up front.

**DON'T:**

- ❌ Accept self-reported benchmark success without proof.
- ❌ Use global evidence for child benchmark tasks.
- ❌ Spell out tool usage in benchmark prompts.

---

## References

- RULE-008 - Evidence-Gated Closure
- `docs/lessons/entries/20260607_1657_benchmarks-must-gate-resource-budgets.md`
- `.afol/wb/` benchmark sessions

---

*Version: 1.0 | Lines: ~90 | Max: 250*
