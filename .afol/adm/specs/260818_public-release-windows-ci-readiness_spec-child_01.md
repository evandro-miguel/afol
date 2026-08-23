---
doc_type: spec-child
id: 260818_public-release-windows-ci-readiness_spec-child_01
theme: public-release-windows-ci-readiness
status: active
owners:
- orchestrator
workstream_intent: Close native Windows, deterministic-byte, isolation, locking, scanner, and local-release blockers.
artifact_purpose: Define exact readiness evidence for the public alpha release candidate.
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

# SPEC CHILD: Public Release, Windows, and Local Readiness

## Required Behavior

- Linux x64 is validated through the local release gate. Native Windows x64 is
  experimental and any native checks are non-gating observations; a skipped
  check is not evidence of support.
- Text bytes used by template hashing are canonical LF bytes independent of
  checkout configuration, and managed locks are generated from those bytes.
- Native Windows sandbox execution does not require WSL or `wslpath`.
- Clean-checkout smoke preserves relative symlinks and proves the verified
  artifact cannot read the source checkout.
- Locks survive PID reuse and partial metadata persistence.
- Security scanners execute the immutable binary identity that was verified.
- Windows verification parses quoted paths ending in a backslash correctly.

## Acceptance

- [ ] Every unresolved P1/P2 review finding has a focused regression test and
      is resolved or superseded by evidence.
- [ ] The local Linux x64 release gate passes on the exact candidate commit.
- [ ] Template hashes match across supported local checkout configurations.
- [ ] Fault-injection and clean-checkout isolation tests pass.
- [ ] `validate:release` passes on the exact candidate commit.

## Public-Readiness Reconciliation (2026-08-23)

ADR-009 disables hosted CI; the local exact-SHA Linux x64 release gate is the
canonical evidence path. Native Windows remains experimental and no hosted or
green status is claimed. macOS and ARM remain unsupported for this alpha.
