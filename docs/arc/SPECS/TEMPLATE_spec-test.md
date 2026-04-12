---
doc_type: spec-test
id: "YYMMDD_HHMM_<theme>_spec-test_01"
theme: "<theme>"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
roadmap_feature: "FEATURE_ID"
parent_spec: "PARENT_SPEC_ID"
links:
  roadmap: "ROADMAP_PATH"
  report: "REPORT_DOC_ID_OR_EMPTY"
risk_level: medium # low|medium|high
---

# SPEC TEST: <theme>

## Journey

- User or operator: <user>
- Journey to validate: <journey>

## Clicks and Commands

- Click path:
  1. <click step>
  2. <click step>
- Command path:
  1. `<command>`
  2. `<command>`

## Recommended Technology

- Preferred layer: <unit|integration|e2e|manual>
- Recommended tooling: <tooling>

## Test Construction

- Setup: <setup>
- Exercise: <action>
- Assert: <assertion>
- Teardown: <cleanup>

## Expected Result

- Functional expectation: <expected output>
- Non-functional expectation: <latency|reliability|accessibility>

## Evidence

- Required evidence in report:
  - <command output>
  - <screenshot or log>
- Pass/fail rule:
  - <criterion>

## Done When

- [ ] Journey and path are explicit
- [ ] Technology choice is explicit
- [ ] Construction strategy is explicit
- [ ] Expected result and evidence are explicit

---

*Template: `docs/arc/SPECS/TEMPLATE_spec-test.md`*
