---
description: Full governed feature spec template with acceptance and verification philosophy.
metadata:
  tags: "template, spec, governance, roadmap, acceptance, testing"
---

# Spec Template

````markdown
---
doc_type: spec
id: "YYMMDD_HHMM_THEME_spec_01"
theme: "theme"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
roadmap_feature: "FEATURE_ID"
spec_role: "SPEC_ROLE" # parent|child|workstream
parent_spec: "PARENT_SPEC_ID_OR_EMPTY"
links:
  roadmap: "ROADMAP_PATH"
  plan: "PLAN_DOC_ID"
  task: "TASK_DOC_ID"
  report: "REPORT_DOC_ID_OR_EMPTY"
scope:
  repo_areas: ["AREA"]
  packages: ["PACKAGE_OR_SERVICE"]
risk_level: low # low|medium|high
---

# SPEC: theme

## 1) Feature Intent
- Outcome: WHAT_CHANGES_FOR_THE_USER_OR_SYSTEM
- Why now: WHY_THIS_FEATURE_MATTERS_NOW
- Roadmap feature: `FEATURE_ID`
- Role of this spec: PARENT_CHILD_OR_WORKSTREAM_REFINEMENT

## 2) Problem
- WHAT_IS_MISSING_OR_UNCLEAR_TODAY
- WHY_THE_CURRENT_STATE_IS_INSUFFICIENT

## 3) Users and User Journey
Primary users:
- USER_TYPE

User journey:
1. STARTING_POINT
2. INTERACTION_OR_DECISION
3. EXPECTED_OUTCOME

Failure or friction points:
- PROBLEM -> EXPECTED_HANDLING

## 4) Experience and Behavior
- Expected behavior:
  - BEHAVIOR
  - BEHAVIOR
- Boundaries:
  - WHAT_SHOULD_NOT_HAPPEN
  - WHAT_REMAINS_OUT_OF_SCOPE

## 5) Scope
In scope:
- ITEM
- ITEM

Out of scope:
- ITEM
- ITEM

## 6) Child Spec Strategy
- Child specs required: YES_OR_NO
- Decomposition rule:
  - WHEN_THIS_SPEC_MUST_SPLIT_INTO_CHILD_SPECS
- Planned child specs:
  - CHILD_SPEC_AND_PURPOSE

## 7) Constraints and Assumptions
- Assumptions:
  - ASSUMPTION
- Constraints:
  - Compatibility: CONSTRAINT
  - Operational: CONSTRAINT
  - Security/privacy: CONSTRAINT

## 8) Acceptance
- Success looks like:
  - ACCEPTANCE_STATEMENT
  - ACCEPTANCE_STATEMENT
- Review questions:
  - Does this spec explain the feature without code?
  - Can an executor understand the user journey from this document alone?

## 9) Risks and Tradeoffs
- Risk: RISK -> Mitigation: MITIGATION
- Tradeoff: TRADEOFF -> Why accepted: REASON

## 10) Rollout and Lifecycle
- Rollout approach:
  - HOW_THIS_ENTERS_DELIVERY
- Workstream linkage:
  - Execution must reference `roadmap_feature` and `parent_spec`
- Backout or deferral:
  - HOW_SCOPE_CAN_BE_SAFELY_REDUCED_OR_DEFERRED

## 11) Verification Philosophy
- Evidence expected from delivery:
  - WHAT_PROOF_SHOULD_EXIST_IN_REPORTS_OR_LOGS
  - WHAT_USER_VISIBLE_PROOF_SHOULD_EXIST
- Test philosophy:
  - Validate behavior at the highest-signal layer first.
  - Prefer a small number of trustworthy checks over a large number
    of shallow checks.
  - Cover happy path, main failure path, boundary conditions, and
    rollback or backout behavior.
- What good validation should touch:
  - User journey or operator workflow
  - Data integrity and state transitions
  - Permissions, auth, or safety boundaries when applicable
  - Observability, logging, or error surfacing for critical failures
  - Integration seams most likely to regress
- Check architecture:
  - Fast deterministic checks should guard the core contract.
  - Broader integration or E2E checks should confirm end-to-end
    behavior only where they buy real confidence.
  - Manual verification should be reserved for UX nuance,
    operational inspection, or cases automation cannot prove well.
  - Evidence should map each important risk to at least one
    credible validation path.
- Anti-patterns to avoid:
  - Overfitting tests to implementation details
  - Counting assertions instead of measuring confidence
  - Relying only on snapshots or only on happy-path checks
  - Declaring success without proving the risky edges changed safely
- Open questions:
  - Q-01 QUESTION
  - Q-02 QUESTION

## 12) Acceptance Checklist
- [ ] User journey is explicit
- [ ] Scope and non-goals are explicit
- [ ] Child-spec policy is defined
- [ ] Constraints and risks are explicit
- [ ] Feature intent is understandable without implementation detail
- [ ] Verification philosophy explains how execution will be validated
````
