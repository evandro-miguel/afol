---
doc_type: spec
id: "YYMMDD_HHMM_<theme>_spec_01"
theme: "<theme>"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
roadmap_feature: "<feature_id>"
spec_role: "<spec_role>" # parent|child|workstream
parent_spec: "<parent_spec_id_or_empty>"
links:
  roadmap: "<roadmap_path>"
  plan: "<plan_doc_id>"
  task: "<task_doc_id>"
  report: "<report_doc_id_or_empty>"
scope:
  repo_areas: ["<area>"]
  packages: ["<package_or_service>"]
risk_level: low # low|medium|high
---

# SPEC: <theme>

## 1) Feature Intent
- Outcome: <what changes for the user or system>
- Why now: <why this feature matters now>
- Roadmap feature: `<feature_id>`
- Role of this spec: <parent, child, or workstream refinement>

## 2) Problem
- <what is missing or unclear today>
- <why the current state is insufficient>

## 3) Users and User Journey
Primary users:
- <user type>

User journey:
1. <starting point>
2. <interaction or decision>
3. <expected outcome>

Failure or friction points:
- <problem> -> <expected handling>

## 4) Experience and Behavior
- Expected behavior:
  - <behavior>
  - <behavior>
- Boundaries:
  - <what should not happen>
  - <what remains out of scope>

## 5) Scope
In scope:
- <item>
- <item>

Out of scope:
- <item>
- <item>

## 6) Child Spec Strategy
- Child specs required: <yes/no>
- Decomposition rule:
  - <when this spec must split into child specs>
- Planned child specs:
  - <child spec + purpose>

## 7) Constraints and Assumptions
- Assumptions:
  - <assumption>
- Constraints:
  - Compatibility: <constraint>
  - Operational: <constraint>
  - Security/privacy: <constraint>

## 8) Acceptance
- Success looks like:
  - <acceptance statement>
  - <acceptance statement>
- Review questions:
  - Does this spec explain the feature without code?
  - Can an executor understand the user journey from this document alone?

## 9) Risks and Tradeoffs
- Risk: <risk> -> Mitigation: <mitigation>
- Tradeoff: <tradeoff> -> Why accepted: <reason>

## 10) Rollout and Lifecycle
- Rollout approach:
  - <how this enters delivery>
- Workstream linkage:
  - Execution must reference `roadmap_feature` and `parent_spec`
- Backout or deferral:
  - <how scope can be safely reduced or deferred>

## 11) Verification Philosophy
- Evidence expected from delivery:
  - <kind of proof>
  - <kind of proof>
- Open questions:
  - Q-01 <question>
  - Q-02 <question>

## 12) Acceptance Checklist
- [ ] User journey is explicit
- [ ] Scope and non-goals are explicit
- [ ] Child-spec policy is defined
- [ ] Constraints and risks are explicit
- [ ] Feature intent is understandable without implementation detail

---
*Template: `.agents/a-docs/templates/spec.md`*
