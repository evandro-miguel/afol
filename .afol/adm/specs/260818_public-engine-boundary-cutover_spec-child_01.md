---
doc_type: spec-child
id: 260818_public-engine-boundary-cutover_spec-child_01
theme: public-engine-boundary-cutover
status: final
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

- The public checkout contains the allowlisted engine, template, tests,
  documentation, and examples without the private operator payload.
- Fresh `bun run validate:release` and public-content audit evidence must be
  recorded against the exact candidate SHA before release readiness is claimed.
- Local canonical checkout: `/home/ozy/01_projects/dev/afol/afol.public`.
- Exact candidate SHA: `09fd89fda14c40c5a4fd8a3160510e22670ec3bc`.
- `dev` and `main` point to the same single reviewed root commit; no remote or
  unreachable history exists.
- A `--no-local` clean clone passed `bun run validate:release` end to end with
  required OSV Scanner and Gitleaks evidence, then passed `bun run public:audit`.
- Root `.afol/**`, root `.agents/**`, hosted workflows, and symlinks are absent;
  audited downstream template payload remains under `src/project-template/**`.
- This evidence does not authorize visibility changes, publication, hosted CI,
  attestations, global installation, or private-history deletion.
