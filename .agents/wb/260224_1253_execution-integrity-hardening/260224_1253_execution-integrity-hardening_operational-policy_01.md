---
doc_type: standard
id: 260224_1906_execution-integrity-operational-policy_standard_01
theme: execution-integrity-hardening
status: active
created_at: '2026-02-24T19:06:00-03:00'
updated_at: '2026-02-26T23:54:14-03:00'
links:
  plan: 260224_1253_execution-integrity-hardening_plan_02
  report: 260224_1253_execution-integrity-hardening_report_02
---

# Operational Policy: Execution Integrity

## Purpose
Define governance, escalation, and operational procedures for the execution-integrity-hardening system.

---

## 1. Unsafe Bypass Governance

### 1.1 Bypass Mechanism
The `--allow-unsafe-done` flag allows marking tasks done without evidence in emergency situations.

### 1.2 Authorization
| Role | Can Approve Bypass | Notes |
|------|-------------------|-------|
| Session Owner | ✅ Yes | Must document justification in task |
| Orchestrator | ✅ Yes | Cross-session emergencies |
| Worker | ❌ No | Must request approval |
| Tester | ❌ No | Must request approval |

### 1.3 Audit Requirements
- **Frequency:** Quarterly review
- **Scope:** All `.evidence.jsonl` entries with bypass warnings
- **Owner:** Session owners + orchestrator
- **Output:** Summary report in `.agents/a-docs/telemetry/reports/`

### 1.4 Logging
All bypasses produce explicit warning:
```
⚠️  mark-done executed without evidence id (unsafe bypass enabled).
```

### 1.5 Acceptable Use Cases
- Production incident requiring immediate task closure
- Legacy session migration (with documented plan)
- Testing/development environments (non-production)

### 1.6 Unacceptable Use Cases
- Routine task completion without evidence
- Avoiding evidence capture workflow
- Bypassing review requirements

---

## 2. Failure Playbook

### 2.1 Severity Classification

| Level | Name | Response Time | Examples |
|-------|------|---------------|----------|
| **S1** | Critical | Immediate (< 1 hour) | Data loss, security breach, all workflows blocked |
| **S2** | High | < 4 hours | Core command failure (`doctor`, `verify-strict`), evidence gating bypassed |
| **S3** | Medium | < 24 hours | Lint warnings, docs drift, non-blocking bugs |
| **S4** | Low | Next sprint | Enhancement requests, cosmetic issues |

### 2.2 Response Procedures

#### S1 - Critical
```
1. Stop: Halt all non-essential work
2. Assess: Identify root cause (use `make doctor`, `make all`)
3. Fix: Implement hotfix with minimal blast radius
4. Test: Add regression test before merge
5. Verify: Run full `make all` pipeline
6. Document: Post-mortem in `.agents/a-docs/lessons/entries/`
7. Escalate: Notify all stakeholders immediately
```

#### S2 - High
```
1. Acknowledge: Confirm issue within 30 minutes
2. Reproduce: Document reproduction steps
3. Fix: Implement fix with test coverage
4. Verify: Run affected command + `make verify-strict`
5. Merge: Require peer review before merge
6. Notify: Update team lead on resolution
```

#### S3 - Medium
```
1. Triage: Add to sprint backlog
2. Fix: Implement during current sprint
3. Verify: Run `make lint` or affected check
4. Merge: Standard PR review process
5. Document: Update relevant docs if drift detected
```

#### S4 - Low
```
1. Backlog: Add to `.agents/a-docs/arc/BACKLOG.md`
2. Prioritize: Review in sprint planning
3. Implement: When capacity available
4. Verify: Standard test coverage
```

### 2.3 Escalation Matrix

| Severity | First Responder | Escalation Path | Final Authority |
|----------|----------------|-----------------|-----------------|
| S1 | Any team member | → Team Lead → Orchestrator | Project Owner |
| S2 | Session Owner | → Team Lead | Orchestrator |
| S3 | Session Owner | → Sprint Review | Team Lead |
| S4 | Any contributor | → Backlog Grooming | Team |

### 2.4 Rollback Procedures
```bash
# 1. Identify last known good state
git log --oneline -10

# 2. Verify current session state
./.agents/agents status

# 3. Revert if necessary
git revert <commit-hash>

# 4. Validate rollback
make doctor && make verify-strict

# 5. Document incident
# Create lesson entry in .agents/a-docs/lessons/entries/
```

---

## 3. Multi-Session Runbook

### 3.1 Session Isolation
- Each workstream has independent folder: `.agents/wb/YYMMDD_HHMM_<theme>/`
- Sessions do not share state except via `.evidence.jsonl` per session
- Active session pointer (`.active_session`) is a convenience, not a lock

### 3.2 Write Operations
**ALWAYS use explicit `--session` for writes:**
```bash
# ✅ Correct
./.agents/agents wb-update evidence T-01 --session 260224_1253_execution-integrity-hardening --command "make verify-strict" --result "passed"

# ❌ Wrong (uses active session, may be ambiguous)
./.agents/agents wb-update evidence T-01 --command "make verify-strict" --result "passed"
```

### 3.3 Parallel Execution Guidelines

| Scenario | Recommendation |
|----------|----------------|
| Same session, same task | Coordinate via task comments |
| Same session, different tasks | Safe to execute in parallel |
| Different sessions | Fully independent, no coordination needed |
| Cross-session writes | Explicit `--session` required for each |

### 3.4 Conflict Resolution
- **Detection:** Evidence ledger audit (`tail -n 20 .evidence.jsonl`)
- **Resolution:** Last-write-wins with manual reconciliation if needed
- **Prevention:** Use task IDs and evidence IDs for traceability

### 3.5 Session Lifecycle
```
1. Create: `.agents/agents new <theme>` or `make new THEME=<theme>`
2. Activate: Automatic (or manual via `.agents/agents status`)
3. Execute: All operations with explicit `--session`
4. Verify: `make verify-strict` or `.agents/agents verify-tasks --strict`
5. Close: Mark all tasks done, publish report, update log
6. Archive: Move to `.agents/z-arq/` if superseded
```

---

## 4. Verification Checklist

### 4.1 Pre-Merge Checklist
**Reference checklist for future work sessions:**
- [ ] `make doctor` passes
- [ ] `make lint` passes (or warnings documented)
- [ ] `make test-scripts` passes
- [ ] `make verify-strict` passes (for touched sessions)
- [ ] Evidence recorded for all `mark-done` operations
- [ ] No contradictions in reports

### 4.2 Release Checklist
**Reference checklist for releases:**
- [ ] `make all` passes
- [ ] Docs parity check: CLI help matches documented examples
- [ ] Evidence ledger audited for bypasses
- [ ] Lessons learned documented
- [ ] Version tag created (if applicable)

### 4.3 Quarterly Audit Checklist
**Reference checklist for audits:**
- [ ] Review all unsafe bypass entries
- [ ] Validate evidence threshold effectiveness
- [ ] Update failure playbook if new patterns found
- [ ] Review multi-session conflict logs
- [ ] Update this policy document if needed

---

## 5. Metrics and Monitoring

### 5.1 Key Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Strict mode pass rate | > 95% | `make verify-strict` results |
| Evidence coverage | 100% (new sessions) | `.evidence.jsonl` entries / tasks completed |
| Bypass usage rate | < 5% | Bypass warnings / total mark-done operations |
| Mean time to resolution (S1/S2) | < 4 hours | Incident log timestamps |

### 5.2 Telemetry Integration
```bash
# Record verification event
./.agents/agents telemetry record --event verification --context "strict-mode-pass"

# Generate weekly report
make telemetry-report --period weekly
```

---

## 6. Document Maintenance

| Aspect | Owner | Review Frequency |
|--------|-------|------------------|
| Bypass governance | Orchestrator | Quarterly |
| Failure playbook | Team Lead | Quarterly |
| Multi-session runbook | Session Owners | As needed |
| Verification checklist | All contributors | Per release |

---

*Template: .agents/a-docs/templates/standard.md*
