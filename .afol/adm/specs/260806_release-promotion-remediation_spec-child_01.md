---
doc_type: spec-child
id: 260806_release-promotion-remediation_spec-child_01
theme: release-promotion-remediation
status: active
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Restore the factual release-promotion contract for AFOL Linux x64.
created_at: '2026-08-06T00:00:00Z'
updated_at: '2026-08-06T00:00:00Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  related:
  - .afol/adm/specs/260715_afol-1-0-linux-wsl-release-hardening_spec-child_01.md
  - .afol/adm/specs/260731_hot-path-observability-and-derived-state-separation_spec_01.md
risk_level: high
---

# SPEC CHILD: Release Promotion Remediation

## Intent

- Outcome: `dev` has no known release blocker and its compiled Linux x64
  artifact is reproducible, checksum-bound, provenance-backed, and governed.
- Roadmap feature: `F-29`.
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`.

## Scope

- Replace the vulnerable `fast-uri` override with its fixed patch release and
  verify the resolved Bun lockfile with OSV.
- Replace pre-cutoff evidence suppression with a versioned, hash-bound legacy
  compatibility baseline. Raw strict audit remains strict.
- Remove compiled-bytecode nondeterminism and prove two equivalent clean builds
  have the same artifact hash.
- Make checksum/provenance emission atomic with the inspected artifact; smoke
  checks must not rebuild or overwrite those release receipts.
- Align project, typecheck, evidence-compatibility, and release documentation.

## Boundaries

- In scope: `dev` source, AFOL governance, local Linux/WSL validation, and
  release artifacts under `dist/`.
- Out of scope: global installation, `main` integration, deployment, non-Linux
  targets, external-model execution, and retired `.agents` runtime surfaces.

## Compatibility Contract

- A baseline admission names each allowed historical session/task and binds its
  State Board/evidence hashes, issue type, approval, and cutoff relation.
- Compatibility never admits open, invalid, post-cutoff, or unlisted content.
- Failed historical evidence requires an individual admission; missing evidence
  may not be fabricated.

## Acceptance

- [ ] OSV reports no unresolved release-blocking dependency finding.
- [ ] Raw strict audit reports historical debt; compatibility validation passes
  only for the admitted baseline and reports it as waived debt.
- [ ] Two clean compiled builds produce the same `dist/afol` SHA-256.
- [ ] Smoke preserves the checksum/provenance of the artifact it executes.
- [ ] Project validation, typecheck, focused regressions, security scans, and
  `validate:release` pass on the final `dev` commit.
- [ ] No global binary is installed or changed by this workstream.

## Public-Readiness Reconciliation (2026-08-18)

- PR #94 commit `e22b32df` passed the local full-suite, typecheck, Biome,
  Oxlint, Knip, template/manifest, clean-checkout smoke, Gitleaks, and OSV
  gates. These observations do not retroactively check every criterion above.
- Hosted run `32186289879` failed before runner assignment on both Linux and
  Windows. GitHub's annotation identifies account payment/spending-limit state
  as the cause.
- The spec remains active until the exact final candidate passes hosted CI and
  `validate:release`; no global installation or promotion is authorized by
  this reconciliation.

## Rollout and Backout

- Keep every change on `dev` until all acceptance gates pass. If a gate fails,
  retain the last verified contract and report the blocker; do not promote or
  install globally.
