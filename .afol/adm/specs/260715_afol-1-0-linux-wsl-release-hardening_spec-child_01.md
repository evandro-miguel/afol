---
doc_type: spec-child
id: 260715_afol-1-0-linux-wsl-release-hardening_spec-child_01
theme: afol-1-0-linux-wsl-release-hardening
status: active
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define Linux x64 and observed WSL2 AFOL 1.0 release hardening.
created_at: '2026-07-15T20:40:00Z'
updated_at: '2026-07-15T20:40:00Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  plan: .afol/wb/260715_1636_afol-1-0-governance-bootstrap/260715_1636_afol-1-0-governance-bootstrap_plan_01.md
risk_level: high
---

# SPEC CHILD: AFOL 1.0 Linux/WSL Release Hardening

## Intent

- Outcome: the AFOL 1.0 Linux x64 release path and observed WSL2 smoke path are
  reproducible, provenance-backed, and explicit about unsupported platforms.
- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Child Scope Rationale

Build provenance and runtime smoke evidence have platform-specific assumptions.
This child isolates those assumptions from diagnostics and keeps the release
claim limited to observed Linux/WSL evidence.

## Required Behavior

- Keep `dist/afol`, existing checksum/provenance filenames, aliases, and build
  contracts; extend provenance only additively.
- Compile the Linux x64 baseline with Bun dotenv/bunfig autoload disabled and
  prove the standalone binary with clean, repository-external smoke.
- Record observed WSL2 smoke evidence separately from Ubuntu/Linux CI evidence;
  static checks alone do not prove runtime readiness.
- Keep `validate:release` composition and explicit typecheck/project preflights.

## Boundaries

In scope:

- Linux x64 deterministic build, checksum/provenance, clean smoke, observed
  WSL2 smoke, release runbook wording, and focused tests.
- Required Gitleaks redacted secret scan and OSV dependency evidence, with
  limitations reported precisely.

Out of scope:

- Windows, macOS, ARM, MCP, remote Feedback Hub, network sync, deployment,
  global installation, artifact renames, result/v2, or F-12 reopening.

## Acceptance

- [x] Linux x64 build and standalone smoke pass from the supported local path.
- [x] Provenance/checksum names and `dist/afol` remain stable and additive.
- [x] Observed WSL2 smoke is current, reproducible, and not conflated with CI.
- [x] Release/security failures remain blocking or are documented as exact
  environment blockers, never silently waived.

## Closure

Release hardening is final in `260715_1811_afol-1-0-final-status` on direct
command evidence `E-20260715180931454-766e6a` and observed artifact
authorization `E-20260715181030468-8dd8d9`. `validate:release` exited 0 at HEAD
`6210ac8`; the supported claim is limited to observed Linux/WSL behavior.

## Verification Plan

Run focused release/provenance tests first, then typecheck, full tests, build,
clean smoke, project validation, release validation, and required security
scans. Record exact commands and evidence in the governed F-29 session.

## Rollout and Backout

Promote only after current Linux/WSL evidence satisfies all gates. If a gate
fails, retain the last known-good build contract and report the specific
missing evidence; do not publish, install globally, or deploy.
