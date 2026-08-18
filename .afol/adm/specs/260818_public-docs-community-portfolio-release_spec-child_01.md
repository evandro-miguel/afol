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

- README leads with value, a CI-verified quickstart, actual product output,
  support/stability tables, safety limits, architecture, and evidence.
- Installation, commands, configuration, troubleshooting, upgrades, rollback,
  security model, release process, roadmap, and case study are public docs.
- Community files define contribution, conduct, support, security reporting,
  issue forms, and PR evidence expectations.
- CI includes native platform tests, CodeQL, dependency review, Dependabot,
  public-hygiene checks, docs examples, minimal permissions, and SHA-pinned
  actions.
- Release assets include checksums, provenance, SPDX SBOM, attestations, known
  limitations, and post-download smoke evidence.

## Acceptance

- [ ] A new user can verify, install, initialize, complete an evidenced task,
      and troubleshoot from a clean clone without private documentation.
- [ ] Case study states role, constraints, architecture, hard problems,
      trade-offs, reproducible metrics, and unresolved limitations.
- [ ] Community and security files pass GitHub public-health checks.
- [ ] The release candidate is ready for explicit authorization to rename the
      remote, change visibility, configure rulesets, and publish immutably.
