---
doc_type: spec-child
id: 260818_public-docs-community-portfolio-release_spec-child_01
theme: public-docs-community-portfolio-release
status: active
owners:
- orchestrator
workstream_intent: Make AFOL understandable, supportable, verifiable, and portfolio-ready without overstating maturity.
artifact_purpose: Define public documentation, community health, case-study, and immutable release requirements.
created_at: '2026-08-18T00:00:00Z'
updated_at: '2026-08-18T00:00:00Z'
roadmap_feature: F-34
spec_role: child
parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260818_public-product-and-portfolio-readiness_spec_01.md
  plan: ''
  task: ''
  report: ''
risk_level: medium
---

# SPEC CHILD: Public Documentation, Community, Portfolio, and Release

## Required Behavior

- README leads with value, a locally verified quickstart, actual product output,
  support/stability tables, safety limits, architecture, and evidence.
- Installation, commands, configuration, troubleshooting, upgrades, rollback,
  security model, release process, roadmap, and case study are public docs.
- Community files define contribution, conduct, support, security reporting,
  issue forms, and PR evidence expectations.
- Local validation includes public-hygiene checks, docs examples, security
  scans, deterministic build checks, known limitations, and post-build smoke
  evidence.
- Release-candidate assets include checksums, provenance, and an SPDX SBOM
  generated locally from the exact candidate SHA.

## Acceptance

- [x] A new user can verify, install, initialize, complete an evidenced task,
      and troubleshoot from a clean clone without private documentation.
- [x] Case study states role, constraints, architecture, hard problems,
      trade-offs, reproducible metrics, and unresolved limitations.
- [ ] Community and security files pass local structure and link checks.
- [ ] The local release candidate is ready for review; repository visibility,
      release publication, rulesets, attestations, and global installation are
      outside this spec.

## Evidence

- The public docs surface includes the landing README, getting started,
  architecture, command reference, security model, troubleshooting,
  upgrade/rollback, release process, known limitations, roadmap, and case
  study without references to private operator documentation.
- The documented release gate is local and exact-SHA based. Hosted workflows,
  public-health checks, and publication are outside the contract and are not
  claimed here.
