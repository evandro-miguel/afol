---
description: Test strategy spec template for journey-first verification planning.
metadata:
  tags: "template, spec-test, testing, strategy, evidence"
---

# Spec Test Template

````markdown
---
doc_type: spec-test
id: "YYMMDD_HHMM_THEME_spec-test_01"
theme: "theme"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
roadmap_feature: "FEATURE_ID"
parent_spec: "PARENT_SPEC_ID"
child_spec: "SPEC_CHILD_ID_OR_EMPTY"
links:
  roadmap: "ROADMAP_PATH"
  report: "REPORT_DOC_ID_OR_EMPTY"
risk_level: medium # low|medium|high
---

# SPEC TEST: theme

## Journey
- User or operator: USER_TYPE
- Journey under test: JOURNEY_NAME

## Clicks and Commands
- Click path:
  1. CLICK_STEP
  2. CLICK_STEP
- Command path:
  1. `COMMAND`
  2. `COMMAND`

## Recommended Technology
- Primary layer: UNIT_OR_INTEGRATION_OR_E2E_OR_MANUAL
- Tooling: TOOLING

## Test Construction
- Setup: SETUP
- Exercise: EXERCISE
- Assert: ASSERT
- Teardown: TEARDOWN

## Expected Result
- Functional result: EXPECTED_BEHAVIOR
- Non-functional result: PERFORMANCE_OR_RELIABILITY_EXPECTATION

## Evidence
- Required evidence in report:
  - COMMAND_OUTPUT
  - SCREENSHOT_OR_LOG
- Pass/fail rule:
  - DETERMINISTIC_CRITERION

## Acceptance
- [ ] Journey is explicit
- [ ] Click and command path is explicit
- [ ] Technology recommendation is explicit
- [ ] Construction strategy is explicit
- [ ] Expected result is explicit
- [ ] Evidence plan is explicit
````
