---
doc_type: rule
id: RULE-012
theme: user-journey-coverage
version: 1.0
created: 2026-06-27
updated_at: '2026-06-27T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# User Journey Coverage

**Purpose:** AFOL command and UX changes must be tied to registered journeys,
expected outputs, and evidence.

## Applies When

Use this rule for command behavior, benchmark scenarios, live-agent tests, UX
flows, spec-tests, maintenance warnings, memory/library flows, and workbench
lifecycle changes.

## Required Behavior

- Register each non-trivial user or agent flow through roadmap, spec, spec-test,
  and evidence. Use `docs/templates/ux-journey.md` for complex flows.
- Every AFOL command change must update or explicitly defer
  `.afol/adm/benchmarks/afol-tool-scenario-coverage-plan.md`.
- A journey must name actor, goal, trigger, expected AFOL tools, expected
  output, state change, failure/recovery path, and evidence.
- Live-agent scenarios are required when the flow depends on agent choice,
  research, memory/library, workbench execution, update safety, maintenance, or
  governance review.
- Deterministic command behavior should use scripted catalog scenarios before
  adding new live-agent prompts.
- Command strings, skipped scenarios, disabled scenarios, and exemption rows are
  not production proof by themselves. They are routing metadata or visible
  backlog until tied to executable scenario evidence.
- Multi-step and live-agent scenarios must carry journey metadata that names the
  user flow and points to saved evidence before they are accepted as live
  coverage.
- Do not create a separate UX registry/control surface while roadmap, spec,
  spec-test, and evidence can serve as the source of truth.
- Do not claim "all tools tested" unless the coverage matrix count matches
  `.afol/adm/tools.json`, subcommands have scripted scenarios, and saved
  benchmark results/reports exist.

## Validation

- Run `afol validate project` after changing this contract.
- Run `afol validate bench --pack <pack-id> --json` for affected benchmark
  packs.
- Inspect saved live-agent tool-call evidence before accepting live coverage.
