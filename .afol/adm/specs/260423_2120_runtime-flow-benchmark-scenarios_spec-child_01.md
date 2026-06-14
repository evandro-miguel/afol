---
doc_type: spec-child
id: 260423_2120_runtime-flow-benchmark-scenarios_spec-child_01
theme: runtime-flow-benchmark-scenarios
status: final
closure_note: Scenario pack delivered (runtime-flow-live-agent-v2) with accuracy/tool metrics and a saved baseline.
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Expand the controlled live-agent benchmark family with more script-heavy
  scenarios and explicit accuracy metrics.
created_at: '2026-04-23T21:20:00-03:00'
updated_at: '2026-06-14T00:00:00-03:00'
roadmap_feature: F-19
spec_role: child
parent_spec: 260423_1605_controlled-runtime-flow-benchmarks_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
risk_level: medium
---

# SPEC CHILD: runtime-flow-benchmark-scenarios

## Intent

- Outcome: the live-agent benchmark family covers more controlled script-driven
  flows, including task marking, evidence registration, timeline writing,
  status/touch automation, and link updates.

## Scope

- In scope:
  - New live scenarios that require the correct scaffold scripts
  - Explicit accuracy metrics per scenario and for the overall pack
  - Additional fixture artifacts needed for script-writing flows
- Out of scope:
  - Cross-provider comparisons
  - Product-level app benchmarks

## Acceptance

- [x] The benchmark pack covers multiple script-heavy workbench flows
- [x] The result payload reports accuracy as well as time and tool usage
- [x] At least one scenario proves task state change through `wb-update`
- [x] At least one scenario proves content/frontmatter writing through
      `wb-update`

## Delivered Baseline

- Pack: `runtime-flow-live-agent-v2`
- Final saved result:
  `.afol/data/benchmarks/results/20260424_122521_runtime-flow-live-agent-v2.json`
- Metrics: `scenario_count=6`, `duration_ms=79383`,
  `tool_call_count=17`, `error_count=0`, `retry_count=0`, `accuracy=1.0`,
  `tool_success_rate=1.0`

---

*Template: `docs/templates/spec-child.md`*
