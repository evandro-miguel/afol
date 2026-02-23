---
doc_type: spec
id: "YYMMDD_HHMM_<theme>_spec_01"
theme: "<theme>"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
links:
  plan: "YYMMDD_HHMM_<theme>_plan_01"
  tasks: "YYMMDD_HHMM_<theme>_task_01"
  report: ""
scope:
  repo_areas: ["<area>"]
  packages: ["<package_or_service>"]
risk_level: low # low|medium|high
---

# SPEC: <theme>

## 1) Objective
- <one sentence outcome>

## 2) Problem
- <what is broken or missing>
- <why it matters>

## 3) Non-goals
- <explicitly out of scope>
- <not doing X>

## 4) Scope
In scope:
- <item>

Out of scope:
- <item>

## 5) Users and Use Cases
Primary user:
- <who>

Use cases:
- UC-01 <use case>
- UC-02 <use case>

## 6) Assumptions
- <assumption>
- <assumption>

## 7) Constraints
- Compatibility: <versions, runtime>
- Repo constraints: <monorepo, worktrees, etc>
- Security: <no secrets, sandbox, etc>

## 8) Proposed Solution
Summary:
- <what we will build>

Key design choices:
- <choice> -> <reason>

## 9) Architecture Impact
Touched layers:
- <layer>
- <layer>

New components:
- <component> at <path>

Dependency rules:
- Allowed deps: <A -> B>
- Forbidden deps: <A -X-> B>

## 10) Interfaces
APIs:
- Endpoint: <name> | Input | Output | Errors

CLI or scripts:
- Command: <cmd> | Effect | Safety

Events or jobs:
- Event: <name> | Producer | Consumer

## 11) Data Model
Entities:
- <entity> fields: <fields>

Storage:
- Table/Collection: <name> key: <key>

Migrations:
- <yes/no> + outline

## 12) Flow
Happy path:
1. <step>
2. <step>

Error paths:
- E-01 <error> -> <handling>
- E-02 <error> -> <handling>

## 13) Error Handling
- Error taxonomy: <types>
- Retries: <policy>
- User messages: <rules>

## 14) Security and Privacy
- Secrets handling: <where stored, never logged>
- Permissions: <who can do what>
- Threats: <top risks> -> <mitigation>

## 15) Performance
Budgets:
- Latency: <target>
- Memory: <target>
- IO: <target>

Hot paths:
- <path> -> <optimization approach>

## 16) Observability
Logs:
- What to log: <events>
- Never log: <secrets, PII>

Metrics:
- <metric> -> <why>

Tracing:
- <optional>

## 17) Rollout Plan
- Feature flag: <yes/no>
- Steps:
  1. <step>
  2. <step>

Backout:
- <how to revert safely>

## 18) Verification Plan
Commands:
- Lint: `<command or N/A>`
- Typecheck: `<command or N/A>`
- Unit: `<command or N/A>`
- E2E: `<command or N/A>`

Test cases:
- TC-01 <test>
- TC-02 <test>

Evidence required:
- Output snippet or CI link recorded in report

## 19) Risks and Mitigations
- Risk: <risk> -> Mitigation: <mitigation>

## 20) Open Questions
- Q-01 <question>
- Q-02 <question>

## 21) Acceptance Checklist
- [ ] Scope and non-goals are explicit
- [ ] Dependency rules defined
- [ ] Verification commands defined
- [ ] Rollout and backout defined
- [ ] Observability included

---
*Template: `.agents/a-docs/templates/spec.md`*
