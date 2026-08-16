---
doc_type: spec-child
id: 260816_core-integrity-remediation_spec-child_01
theme: core-integrity-remediation
status: active
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Close verified crash-durability, governance, benchmark, and lifecycle integrity gaps without reopening retired runtime surfaces.
created_at: '2026-08-16T23:15:17Z'
updated_at: '2026-08-16T23:15:17Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  plan: .afol/wb/260816_1815_core-integrity-remediation/260816_1815_core-integrity-remediation_plan_01.md
  task: .afol/wb/260816_1815_core-integrity-remediation/260816_1815_core-integrity-remediation_task_01.md
  report: .afol/wb/260816_1815_core-integrity-remediation/260816_1815_core-integrity-remediation_report_01.md
risk_level: high
---

# SPEC CHILD: Core Integrity Remediation

## Intent

- Outcome: AFOL fails closed and remains recoverable across mutation crashes,
  governance resolution, benchmark measurement, and lifecycle concurrency.
- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Child Scope Rationale

Independent audits found related integrity defects spanning shared persistence,
catalog resolution, benchmark provenance, and workbench state. This child owns
the bounded remediation because each defect can produce a false success,
permanent operational block, or data-loss window in the AFOL 1.0 finalization
surface. It does not reopen final product features or introduce a new runtime.

## Required Behavior

- Mutation journal appends are durable, bounded, and recoverable; a crash after
  `prepared` cannot permanently block supported mutations or silently invent a
  terminal result.
- Move/archive rollback preserves at least one durable byte copy at every step
  and supports deterministic fault injection.
- Governance resolution accepts only open pending entries, uses one canonical
  spec lookup contract, supports valid residual children end-to-end, surfaces
  corrupt pending state, and fails partial bulk operations nonzero.
- Token gates measure each command sample from stdout and stderr under one
  documented estimator. Aggregate run output remains diagnostic rather than
  replacing the per-command 5k warning and 10k failure contract.
- Runtime-live archives carry observed harness profile and correct byte fields;
  selectors route validation changes to token-economy and registries reject
  duplicate scenario IDs.
- Single-task completion fences the observed task attempt, carry-open is
  recoverable and idempotent after interruption, State Board parsing is shared,
  and derived workbench snapshots use atomic persistence.

## Boundaries

In scope:

- `cli/services/mutations/**` and supported file mutation commands
- Governance catalog, pending-spec, spec-gate, catchup, and bulk-waive paths
- Validation scenario execution, selector, runtime-live, and CLI micro gates
- Workbench completion/close/carry-open, State Board parsing, and local indexes
- Focused fault-injection tests, selective mutation testing, full local release
  validation, required security scans, and independent review

Out of scope:

- Global installation, deployment, `main` promotion, network listeners,
  permission changes, discontinued `.agents` runtime surfaces, and unrelated
  refactors

## Risks and Mitigations

- Automatic journal recovery can misclassify partial filesystem state -> use
  operation-specific reconciliation with hashes/backups under the journal lock.
- Resolver unification can break legacy fixtures -> preserve only explicitly
  supported compatibility and test canonical AFOL-only paths first.
- Token threshold changes can invalidate baselines -> specify the contract and
  update only affected fixtures/baselines with measured evidence.
- Lifecycle recovery can duplicate continuations -> use stable intent identity
  and interruption tests before accepting the state transition.

## Acceptance

- [ ] Every confirmed defect has a failing regression or fault-injection test
      before its production correction.
- [ ] Focused tests and typecheck pass for each bounded slice.
- [ ] Selective mutation testing leaves no untriaged dangerous survivor in the
      changed integrity predicates.
- [ ] AFOL project, benchmark, release, Gitleaks, and OSV gates pass on the exact
      final commit candidate.
- [ ] Independent review finds no unresolved critical/high correctness defect.
- [ ] Changes are committed and pushed to `origin/dev`; `main` and the global
      AFOL binary remain untouched.

---

*Template: `docs/templates/spec-child.md`*
