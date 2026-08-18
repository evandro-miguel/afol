---
doc_type: spec-child
id: 260818_public-legal-third-party-licensing_spec-child_01
theme: public-legal-third-party-licensing
status: active
owners:
- orchestrator
workstream_intent: Establish MIT licensing and complete provenance for every distributed third-party file.
artifact_purpose: Define the legal distribution boundary and automated license evidence.
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
risk_level: high
---

# SPEC CHILD: Public Legal and Third-Party Licensing

## Required Behavior

- AFOL-owned public source is licensed under MIT.
- Every vendored or generated third-party file records source repository,
  immutable revision/hash, SPDX license, local modifications, and distribution
  need.
- Development-only external skills remain private and are not exported.
- Template skills without proven compatible licensing are removed.
- Runtime dependencies are classified as runtime dependencies for every
  advertised distribution path.
- Public releases include third-party notices and an SPDX SBOM.

## Acceptance

- [ ] `LICENSE` and `THIRD_PARTY_NOTICES.md` are complete and accurate.
- [ ] Every distributed third-party file has proven compatible licensing.
- [ ] License compliance and SBOM generation pass in CI.
- [ ] No runtime dependency is hidden only in development dependencies.
