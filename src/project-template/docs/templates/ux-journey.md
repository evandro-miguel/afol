---
doc_type: ux-journey
id: YYMMDD_HHMM_<theme>_ux-journey_01
theme: <theme>
status: draft
owners:
- orchestrator
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: YYYY-MM-DDTHH:MM:SSZ
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
spec_test: <spec_test_id_or_empty>
---

# UX Journey: <theme>

## Purpose

- User or agent: <primary actor>
- Goal: <expected result>
- Context: <when this journey starts>

## Entry And Exit

- Entry point: <command, screen, task, or event>
- Success exit: <what proves completion>
- Recovery exit: <how the user returns after failure>

## Facts, Assumptions, Unknowns

- Facts:
  - <verified source, command output, or existing artifact>
- Assumptions:
  - <belief that still needs validation>
- Unknowns:
  - <open question that affects UX or recovery>

## Current Experience Map

| Phase | Action | Thought or question | Emotion or risk | Touchpoint | Evidence | Friction | Opportunity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <phase> | <what happens now> | <what the user or agent needs to know> | <confidence, confusion, risk, or pressure> | <command, file, doc, UI, hook, report, or state> | <source proving this> | <where effort or failure appears> | <specific improvement> |

## Target Experience Map

| Phase | Target behavior | Change needed | Owner | Metric | Validation |
| --- | --- | --- | --- | --- | --- |
| <phase> | <what should happen> | <command, doc, state, or workflow change> | <role> | <signal> | <test, review, benchmark, or live run> |

## Service Blueprint

| Phase | Frontstage | Backstage | Systems or data | Policy or guardrail | Failure mode |
| --- | --- | --- | --- | --- | --- |
| <phase> | <visible output, prompt, or artifact> | <agent/system work> | <state files, registry, benchmark, telemetry> | <rule, budget, approval, cadence> | <how failure is detected and recovered> |

## Flow

1. <step>
   - Information shown:
   - User or agent decision:
   - AFOL command/tool:
   - System state:
   - Possible failure:
   - Recovery:

## Expected Result

- Output:
- Durable state change:
- Warning or review prompt:
- Token/output budget:

## States And Recovery

- Default:
- Loading or in-progress:
- Empty or no results:
- Error:
- Partial failure:
- Permission denied or approval required:
- Stale state:
- Success:
- First use:
- Returning user:

## Evidence

- Scripted scenario:
- Live-agent scenario:
- Benchmark pack:
- Report or workbench evidence:

## Metrics

- Completion criterion:
- Error/retry criterion:
- User effort or latency criterion:
- Support or confusion signal:
- Quality or review signal:

## Acceptance

- [ ] Primary actor and goal are explicit
- [ ] Facts, assumptions, and unknowns are separated
- [ ] Current and target experience maps are explicit
- [ ] Frontstage, backstage, systems, and guardrails are explicit
- [ ] Steps, states, failures, and recovery are explicit
- [ ] Expected AFOL tools are named
- [ ] Expected output and durable state change are explicit
- [ ] Evidence path is explicit

---

*Template: `docs/templates/ux-journey.md`*
