---
doc_type: research
id: 260224_1253_execution-integrity-hardening_research_01
theme: execution-integrity-hardening
status: final
created_at: '2026-02-24T19:00:00-03:00'
updated_at: '2026-02-24T19:06:00-03:00'
links:
  plan: 260224_1253_execution-integrity-hardening_plan_02
  task: 260224_1253_execution-integrity-hardening_task_01
---

# Research: Command Reliability Matrix & Failure Classification

## P1-T01: Command Reliability Matrix

| Command | Wrapper Level | Make Level | Script Level | Status | Notes |
|---------|--------------|------------|--------------|--------|-------|
| `doctor` | ✅ `.agents doctor` | ✅ `make doctor` | ✅ `agents-doctor.py` | PASS | Structure validation green |
| `lint` | ✅ `.agents lint` | ✅ `make lint` | ✅ `agents-lint-docs.py` | PASS | 289 files, 1 issue próprio |
| `test-scripts` | ✅ `.agents test` | ✅ `make test-scripts` | ✅ `test_*.py` (36 tests) | PASS | 36/36 tests OK |
| `verify-active` | ✅ `.agents verify-tasks` | ✅ `make verify-active` | ✅ `verify-tasks.py` | PASS | 8/8 tasks completed |
| `verify-strict` | ✅ `.agents verify-tasks --strict` | ✅ `make verify-strict` | ✅ `verify-tasks.py --strict` | PASS | Evidence + contradictions + temporal |
| `tools-check` | ✅ `.agents tools` | ✅ `make tools-check` | ✅ `agents-tools.py` | PASS | 15 tools, 10 categories |
| `all` | N/A | ✅ `make all` | ✅ Multiple scripts | PASS | Full pipeline green |

## P1-T02: Failure Classification

### Issues Found (1 próprio, 74 externos)

| Type | Count | Severity | Files Affected | Remediation |
|------|-------|----------|----------------|-------------|
| **Docs (próprio)** | 1 | Low | report_02.md | Fixed: 'completed' → 'final' |
| **Docs (externos .tmp)** | 74 | None (ignored) | .agents/.tmp/ | Excluded via lint config |

### Failure Types Definition

1. **Contract Failures**: CLI interface mismatch, missing required flags
   - Example: `wb-update task --mark-done` without `--evidence-id`
   - Detection: Unit tests, strict mode

2. **Implementation Failures**: Script logic errors, unhandled exceptions
   - Example: verify-tasks temporal checks without PyYAML
   - Detection: Unit tests, E2E tests

3. **Docs Parity Failures**: Documentation drift from actual CLI behavior
   - Example: Help text shows different flags than implemented
   - Detection: Parity checks in release checklist

4. **Environment Sensitivity**: Path issues, missing dependencies, OS-specific behavior
   - Example: Windows vs Unix path separators
   - Detection: Cross-platform tests, environment validation

## P1-T03: Severity and Remediation Order

### Severity Levels

| Level | Name | Response Time | Examples |
|-------|------|---------------|----------|
| **S1** | Critical | Immediate | Data loss, security breach, blocking all workflows |
| **S2** | High | < 4 hours | Core command failure, evidence gating bypassed |
| **S3** | Medium | < 24 hours | Non-blocking bug, docs drift, lint warnings |
| **S4** | Low | Next sprint | Cosmetic issues, enhancement requests |

### Remediation Order (Critical → High → Medium)

1. **Critical (S1)**: Evidence gating bypassed, data corruption
   - Action: Hotfix + regression test + post-mortem

2. **High (S2)**: Core commands failing (`doctor`, `verify-strict`)
   - Action: Fix + test + verify before merge

3. **Medium (S3)**: Lint warnings, docs drift, non-blocking bugs
   - Action: Fix in current sprint, verify in CI

4. **Low (S4)**: Enhancement requests, nice-to-have features
   - Action: Backlog prioritization

## Residual Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Legacy sessions without evidence | Medium | Warn-only policy for transition |
| Unsafe bypass overuse | Low | Audit log + periodic review |
| Multi-session concurrency | Low | Explicit `--session` requirement |
| Docs drift over time | Medium | Parity check in release checklist |

---
*Template: .agents/a-docs/templates/research.md*
