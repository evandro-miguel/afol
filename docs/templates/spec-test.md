---
doc_type: spec-test
id: YYMMDD_HHMM_<theme>_spec-test_01
theme: <theme>
status: draft
owners:
- orchestrator
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: YYYY-MM-DDTHH:MM:SSZ
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
child_spec: <spec_child_id_or_empty>
links:
  roadmap: <roadmap_path>
  plan: <plan_doc_id>
  task: <task_doc_id>
  report: <report_doc_id_or_empty>
risk_level: medium
---

# SPEC TEST: <theme>

## Intent

- Journey or behavior under test: <journey_name>
- Why this test strategy is needed now: <reason>
- Related feature: `<feature_id>`
- Parent spec: `<parent_spec_id>`

## Journey

- Primary user or operator: <user_type>
- Entry point: <screen_or_command>
- Exit condition: <visible_or_state_result>

## Clicks and Commands

- UI click path:
  1. <click_step>
  2. <click_step>
- CLI or API command path:
  1. `<command_or_call>`
  2. `<command_or_call>`
- Inputs and fixtures:
  - <input_or_fixture>

## Recommended Technology

- Primary test layer: <unit|integration|e2e|manual>
- Recommended tools: <playwright|pytest|shell|other>
- Notes on why this technology is preferred:
  - <reason>

## Test Construction Strategy

- Test structure:
  - Setup: <setup>
  - Exercise: <action>
  - Assert: <assertion>
  - Teardown: <cleanup>
- Coverage focus:
  - Happy path: <what must pass>
  - Main failure path: <what must fail safely>
  - Boundary condition: <edge>

## Expected Result

- Functional result: <expected behavior>
- Non-functional expectation: <latency|accessibility|reliability expectation>
- Failure messaging expectation: <error surface>

## Evidence Plan

- Evidence format in report:
  - Command output snippets: <yes_or_no>
  - Screenshots or recordings: <yes_or_no>
  - Logs or metrics: <yes_or_no>
- Pass/fail rule:
  - <deterministic criterion>
- Report link target:
  - `<report_doc_id_or_path>`

## Risks and Follow-ups

- Open risk: <risk> -> Follow-up: <action>
- Deferred case: <case> -> Owner: <owner>

## Acceptance

- [ ] Journey is explicit
- [ ] Click and command path is explicit
- [ ] Recommended technology is justified
- [ ] Construction strategy is explicit
- [ ] Expected result is explicit
- [ ] Evidence plan is explicit

---

*Template: `docs/templates/spec-test.md`*
