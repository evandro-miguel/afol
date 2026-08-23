---
doc_type: spec
id: 260818_public-product-and-portfolio-readiness_spec_01
theme: public-product-and-portfolio-readiness
status: active
owners:
- orchestrator
workstream_intent: Establish a clean, reproducible, evidence-backed public AFOL product and portfolio boundary.
artifact_purpose: Govern the public source cutover, alpha scope, release readiness, legal review, engineering hardening, and public presentation.
created_at: '2026-08-18T00:00:00Z'
updated_at: '2026-08-19T00:00:00Z'
roadmap_feature: F-34
spec_role: parent
parent_spec: ''
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - cli
  - src/project-template
  - tests
  - docs
  - .github
  packages:
  - afol-cli
risk_level: high
---

# SPEC: Public Product and Portfolio Readiness

## Intent

- Outcome: AFOL is released as an honest alpha from a clean public repository
  that independently contains the complete engine, tests, template, public
  documentation, and local release tooling.
- Public identity: **AFOL CLI**, where AFOL means **A Folder**.
- Product statement: a provider- and harness-independent local CLI that gives
  coding agents consistent tools, governed work, safe mutations, and observed
  completion evidence.

## Release Contract

- Version: `0.1.0-alpha.1`.
- Distribution: binary-first; the package remains private and is not published
  to npm or another registry.
- Supported: Linux x64, proven by the Linux release gate. WSL2 is supported
  only with an observed smoke.
- Experimental: native Windows x64. Linux-local evidence does not establish
  native Windows support.
- Unsupported for this alpha: macOS and ARM.
- Stable alpha: init/bootstrap, status and health, governed task lifecycle,
  evidence/done/close, project validation, previewed updates, safe local
  mutations, template ownership, and release verification.
- Experimental: Evolution, Fleet, provider integrations not proven by the
  release matrix, historical analysis, and other changing automation.
- Planned: memory/library adoption and surfaces not implemented and verified.

## Canonical Boundary

The public repository is the sole canonical source for engine code, product
template, tests, public documentation, examples, local release tooling, and
release artifacts.
Private repositories may retain raw operations, workbench history, research,
RAG configuration, and sensitive evidence, but may not contain a divergent
engine used to produce releases.

The public export is allowlisted. Root `.afol/**`, root `.agents/**`, private
operator instructions, raw sessions, local paths, private repository names,
RAG configuration, external development skills, and historical evidence do
not cross the boundary. Audited nested template payload under
`src/project-template/.afol/**` and `src/project-template/.agents/**` is product
code and may be distributed.

## Workstreams

1. Release and platform readiness.
2. Security and governance reconciliation.
3. Public engine boundary and canonical cutover.
4. Legal and third-party licensing.
5. Architecture and code-quality hardening.
6. Public documentation, community, portfolio, and release.

## Freeze

Until this spec is final, new product features are outside the stable-alpha
scope. F-30 and F-33 remain active roadmap work but are explicitly experimental
and do not expand the release candidate.

## Acceptance

- [ ] All six child specs are final with exact-commit evidence.
- [ ] No release-blocking security, governance, platform, or release
      acceptance is pending.
- [x] A clean public clone builds and tests without private repository state.
- [x] Public history and current content pass privacy, secret, symlink, large
      file, dependency vulnerability, and third-party license checks.
- [ ] Stable, experimental, planned, supported, and unsupported claims match
      runtime behavior and local exact-SHA evidence.
- [ ] Release-candidate assets carry checksums, provenance, and an SPDX SBOM
      generated from the exact candidate commit.
- [ ] This spec does not authorize repository visibility changes, release
      publication, remote renames, attestations, or global installation.

Readiness evidence must be rerun against the exact candidate SHA in the public
checkout. Prior candidate snapshots are not current release proof. Hosted CI,
publication, attestations, visibility changes, and global installation are
outside the local release contract and remain unclaimed.

## Non-Goals

- Publishing the current private history or raw AFOL workbench.
- npm/package-manager distribution.
- macOS, ARM, hosted service, daemon, or multi-principal authentication.
- Stabilizing Evolution, Fleet, or memory/library adoption for this alpha.
- Provider or model selection, invocation, scheduling, retry, or supervision.
