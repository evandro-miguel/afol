---
doc_type: spec-child
id: 260818_public-engine-boundary-cutover_spec-child_01
theme: public-engine-boundary-cutover
status: active
owners:
- orchestrator
workstream_intent: Make the complete AFOL engine independently buildable from an allowlisted public source tree.
artifact_purpose: Define sanitization, history, source-of-truth, and private-state decoupling requirements.
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

# SPEC CHILD: Public Engine Boundary and Canonical Cutover

## Required Behavior

- `package.json` is the canonical version source; public builds do not read
  private root governance state.
- Manifest generation owns only the distributable template payload.
- Release validation initializes a temporary downstream project and never
  requires root `.afol/**` or root `.agents/**`.
- The export uses an explicit allowlist and creates a fresh public history.
- Root private governance, workbench, RAG, harness, skills, paths, repository
  names, and raw evidence are absent from current content and reachable public
  history.
- After cutover, releases build only from the public canonical repository.

## Acceptance

- [x] A clean allowlisted export builds, tests, and validates independently.
- [x] Removing private repository access does not affect the public build.
- [x] Public hygiene checks find no private paths, repository names, absolute
      symlinks, unexpected binaries, or large files.
- [x] Public history begins with reviewed sanitized commits rather than a
      rewrite or mirror of private history.

## Evidence

- Local public candidate commit: `03afc0f` in
  `/home/ozy/01_projects/dev/afol/afol.public-candidate`.
- `bun run validate:release` passed from the clean candidate at that commit,
  including 456 tests, critical-surface coverage, deterministic build,
  Gitleaks, OSV, release provenance, artifact smoke, and clean-checkout smoke.
- `bun run scripts/audit-public-content.ts
  /home/ozy/01_projects/dev/afol/afol.public-candidate` passed.
