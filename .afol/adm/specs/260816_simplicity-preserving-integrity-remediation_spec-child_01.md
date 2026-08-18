---
doc_type: spec-child
id: 260816_simplicity-preserving-integrity-remediation_spec-child_01
theme: simplicity-preserving-integrity-remediation
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Close verified integrity and latency gaps without adding blocking global state or speculative infrastructure.
created_at: '2026-08-17T01:19:23Z'
updated_at: '2026-08-17T02:17:38Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  plan: .afol/wb/260816_2020_simplicity-preserving-integrity-remediation/260816_2020_simplicity-preserving-integrity-remediation_plan_01.md
  task: .afol/wb/260816_2020_simplicity-preserving-integrity-remediation/260816_2020_simplicity-preserving-integrity-remediation_task_01.md
  report: .afol/wb/260816_2020_simplicity-preserving-integrity-remediation/260816_2020_simplicity-preserving-integrity-remediation_report_01.md
risk_level: high
---

# SPEC CHILD: Simplicity-Preserving Integrity Remediation

## Intent

- Close verified residual data-integrity, token-measurement, lifecycle,
  evolution, scaffold-delivery, and fast-path defects.
- Preserve the current AFOL architecture and keep default lifecycle commands
  free of new global blockers or mandatory scans.
- Prove that the accepted fixes do not regress the `afol s`, `st`, `d`, or `c`
  fast paths.

## Required Behavior

- Mutation rollback preserves at least one durable byte copy until its
  replacement is atomically installed; legacy undo fails locally when prior
  state cannot be proven.
- Update logic distinguishes missing files from empty user files and detects
  ownership-key deletion symmetrically. Corrupt optional Claude configuration
  skips Claude payload management without blocking unrelated update work.
- Fleet dirty-state exclusions apply only to AFOL-owned paths, while health
  remains advisory rather than a default write blocker.
- Adoption review decisions are durably appended, serialized at the journal
  level, re-fingerprinted under the same lock, and terminal on first decision.
- Token policy evaluates the maximum per-command sample from stdout and stderr:
  more than 5k estimated tokens warns and more than 10k fails.
- Closed-without-event recovery verifies coherent terminal state; legacy
  durable-close recovery remains supported.
- Status reuses already-loaded project context, bounds Git probes, reuses
  health/index work, and lazily loads diagnostic SQLite without changing
  observable status semantics.
- The receipts diff buffer and catalog glob compilation receive only localized,
  measured fixes.

## Simplicity And Non-Blocking Boundaries

- No new dependency, persistent cache, database, journal, protocol, daemon,
  watcher, network requirement, or default full-corpus scan.
- No journal rotation/compaction in this slice; current bounded size evidence
  does not justify a new lifecycle.
- No broad Git abstraction, parser/hash/JSON deduplication campaign, schema
  rewrite, or runtime-wide filesystem refactor.
- Integrity failures block only the affected operation and include actionable
  recovery context; health remains advisory.
- Evolution, fleet, health, and diagnostic SQLite work must not enter the
  default `afol s`, `st`, `d`, or `c` execution path.
- No global installation, `main` promotion, deployment, harness permission
  change, or retired `.agents` runtime work.

## Acceptance

- [x] Each changed predicate has a focused regression or fault-injection test
      asserting observable behavior and relevant boundaries.
- [x] Before/after benchmark evidence shows no material regression in default
      status and lifecycle latency or output size.
- [x] Focused tests, typecheck, full test suite, project validation, release
      validation, Gitleaks, and dependency vulnerability checks pass on the
      exact final commit candidate.
- [x] Independent review finds no unresolved critical/high correctness,
      blocking-path, performance, or needless-complexity defect.
- [x] Changes are committed and pushed to `origin/dev`; `main` and the global
      AFOL binary remain untouched.

---

*Template: `docs/templates/spec-child.md`*
