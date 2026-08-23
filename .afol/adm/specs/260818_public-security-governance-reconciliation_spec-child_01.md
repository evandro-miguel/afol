---
doc_type: spec-child
id: 260818_public-security-governance-reconciliation_spec-child_01
theme: public-security-governance-reconciliation
status: active
owners:
- orchestrator
workstream_intent: Reconcile security, lifecycle, release, and no-op evidence claims before public release review.
artifact_purpose: Prevent public claims from exceeding exact observed governance evidence.
created_at: '2026-08-18T00:00:00Z'
updated_at: '2026-08-19T00:00:00Z'
roadmap_feature: F-34
spec_role: child
parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260818_public-product-and-portfolio-readiness_spec_01.md
  plan: ''
  task: ''
  report: ''
risk_level: high
---

# SPEC CHILD: Public Security and Governance Reconciliation

## Required Behavior

- Every release-blocking acceptance item maps to a test, artifact,
  evidence record, and exact commit where applicable.
- C01 action-policy limits and deployment assumptions are explicit and its
  focused proofs are recorded before closure.
- Release-promotion remediation and sequential verification close only with
  clean-checkout and local exact-SHA evidence.
- Historical no-op evidence debt is resolved through the bounded, hash-linked
  transition policy; issue #84 closes only after exact revalidation.
- Experimental, planned, compatibility, and stable surfaces cannot be confused
  in public governance or CLI discovery.

## Acceptance

- [ ] Zero release-blocking spec acceptance item remains pending.
- [x] Issue #84 is closed with exact validation evidence.
- [x] README, roadmap, specs, command metadata, and implementation agree on
      Linux x64 supported, WSL2 observed, Windows experimental, and
      macOS/ARM unsupported.
- [x] Threat-model claims state deployment boundaries and non-boundaries.
