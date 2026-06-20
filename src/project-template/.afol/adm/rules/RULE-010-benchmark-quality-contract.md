---
doc_type: rule
id: RULE-010
theme: benchmark-quality-contract
version: 1.1
created: 2026-06-09
updated_at: '2026-06-20T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Benchmark Quality Contract

**Purpose:** benchmark sessions require isolated evidence and explicit resource
governance.

## Applies When

Use this rule for benchmarks, live-agent tests, and performance measurements.

## Evidence

- Plan, task, report, and evidence files must exist at closure.
- Self-reported success is invalid without final artifact proof.
- Hard-run acceptance needs artifact inspection plus tool-call/accounting logs.
- Benchmark prompts must not dictate tool usage; harness owns tool selection.
- Every tool/progress event must be logged.

## Isolation

- Child benchmark tasks must prove fixture-local provenance.
- Shared/global evidence is invalid for isolated benchmark tasks.
- Diverged target branches publish through an executor branch, not force push.

## Resources

- Providers need rate-accounting tests and configured caps.
- Token/request/RPM/RPD budgets must be explicit in benchmark config.
- New providers start with config plus implementation-plan artifact naming
  runtime, model, and caps.

## Validation

- Artifacts exist: plan, task, report, evidence.
- Accounting logs are present and within caps.
- Tool-call logs match expected execution trace.
- `afol verify-tasks --strict <session>` reports no gaps.

## References

- RULE-008 - Evidence-Gated Closure
- `.afol/wb/` benchmark sessions
