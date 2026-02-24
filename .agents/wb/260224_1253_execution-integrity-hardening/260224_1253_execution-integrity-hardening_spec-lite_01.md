---
doc_type: spec-lite
id: 260224_1253_execution-integrity-hardening_spec-lite_01
theme: execution-integrity-hardening
status: active
owners:
- orchestrator
created_at: '2026-02-24T12:56:00-03:00'
updated_at: '2026-02-24T13:07:03-03:00'
links:
  tasks: 260224_1253_execution-integrity-hardening_task_01
risk_level: medium
---

# SPEC LITE: execution-integrity-hardening

## Objective
- Prevent false completion claims by enforcing evidence-backed, machine-validated task closure.

## Change Summary
- Add strict task verification and contradiction checks.
- Add evidence-aware done workflow.
- Add strict make gate and docs updates.

## Files and Areas
- .agents/scripts/verify-tasks.py
- .agents/scripts/agents-wb-update.py
- .agents/a-docs/standards/Makefile
- .agents/a-docs/standards/scripts-usage.md
- .agents/scripts/tests/

## Risks
- Legacy sessions failing strict checks -> add migration mode and explicit compatibility policy.

## Verification
- Commands:
  - ./.agents/agents verify-tasks .agents/wb/260224_1253_execution-integrity-hardening --strict
  - make verify-strict
- Evidence:
  - Command output snippets and fixture results in report_01.

## Done When
- [ ] Strict checks implemented and covered by tests
- [ ] Validation gates updated
- [ ] Report includes evidence and residual risks

---
*Template: .agents/a-docs/templates/spec-lite.md*
