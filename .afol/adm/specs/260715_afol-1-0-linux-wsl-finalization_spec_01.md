---
doc_type: spec
id: 260715_afol-1-0-linux-wsl-finalization_spec_01
theme: afol-1-0-linux-wsl-finalization
status: final
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define the collision-safe AFOL 1.0 Linux/WSL finalization contract.
created_at: '2026-07-15T20:40:00Z'
updated_at: '2026-07-15T20:40:00Z'
roadmap_feature: F-29
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
  child_specs:
  - .afol/adm/specs/260715_afol-1-0-local-diagnostics_spec-child_01.md
  - .afol/adm/specs/260715_afol-1-0-linux-wsl-release-hardening_spec-child_01.md
  - .afol/adm/specs/260726_canonical-adm-context-index-migration_spec-child_01.md
risk_level: high
---

# AFOL 1.0 Linux/WSL Finalization

## Objective

Deliver the final AFOL 1.0 hardening lane for Linux and WSL2. The lane joins
local diagnostics, governance/index integrity, and standalone release evidence
under one bounded feature while preserving all accepted CLI contracts and the
AFOL-only downstream boundary.

## Child Spec Strategy

- `260715_afol-1-0-local-diagnostics_spec-child_01` owns offline diagnostic
  persistence, redaction, contention limits, and integrity/error evidence.
- `260715_afol-1-0-linux-wsl-release-hardening_spec-child_01` owns the Linux
  x64 build/provenance contract and observed WSL2 smoke/release gates.
- `260726_canonical-adm-context-index-migration_spec-child_01` owns the
  canonical administration section-index migration, fail-closed coverage and
  freshness checks, and selectable-section token-health model.
- The parent owns cross-child acceptance, compatibility constraints, and the
  final evidence ledger; neither child may expand into Windows, macOS, ARM,
  MCP, remote sync, or result/v2 work.

## Required Behavior

- Existing `afol.result/v1`, `envelopeErr`, aliases, quick-task behavior,
  `-x`, `--test`, `--test-shell`, long forms, `dist/afol`, checksums, and
  provenance filenames remain byte- or behavior-compatible unless a child
  spec explicitly adds optional metadata.
- Governance references are real and collision-safe: F-29 is the only new
  feature identifier; F-12 remains final and F-23 through F-28 remain reserved.
- Specs Markdown index rows and summary counts must match current spec
  frontmatter; project validation must fail on missing, stale, duplicate, or
  metadata-mismatched rows.
- Diagnostics are offline and opt-in, redact before persistence, use bounded
  local storage/contended writes, and never open a network listener or sync
  remotely.
- Release claims are limited to Linux x64 and observed WSL2 evidence. Missing
  or failed functional, freshness, provenance, or security gates remain
  blockers.

## Scope

In scope:

- `.afol/adm/roadmap/GENERAL-ROADMAP.md`, parent/child specs, and index drift
  validation.
- CLI diagnostics and integrity boundaries described by the child spec.
- Linux x64 standalone build/provenance and observed WSL2 smoke evidence.
- Focused tests, project/release validation, GitNexus change detection, and
  redacted Gitleaks/OSV evidence.

Out of scope:

- Product behavior unrelated to finalization, broad CLI redesign, or a global
  envelope migration.
- Windows, macOS, ARM, MCP, remote Feedback Hub, network sync, result/v2,
  global install, deployment, push, or reserved F-23 through F-28 work.
- Restoring `.agents/agents`, `.agents/scripts`, `.agents/runtime`, `.agents/wb`,
  `.agents/z-arq`, `agents.config`, or `legacy:` routes.

## Acceptance

- F-29 parent and all children exist with valid frontmatter, explicit links,
  and an index row for every current spec.
- `afol validate project --check-drift --json` reports no index/frontmatter
  drift after local-state rebuild.
- Focused diagnostics and integrity tests establish redaction, no network,
  bounded contention, no lost updates, safe failure metadata, and no raw
  stack output.
- Linux x64 build, provenance/checksum, clean smoke, observed WSL2 smoke, and
  release/security checks produce current evidence or an explicit blocker.
- No unsupported platform or deployment claim is made from static checks alone.

## Closure

The original Linux/WSL release slice was finalized in
`260715_1811_afol-1-0-final-status` with diagnostics
evidence `E-20260715172724325-99e5fa`, release evidence
`E-20260715180931454-766e6a` and observed artifact authorization
`E-20260715181030468-8dd8d9`. Full tests were `1203/0` and
`validate:release` exited 0 at HEAD `6210ac8`. The closure makes no global
installation, deployment, remote CI, or unsupported-platform claim.

The canonical administration context child is finalized in session
`260726_1302_canonical-context-index-repair` after focused regression,
typecheck, formatting, project validation, and independent spec/quality
reviews. This does not invalidate the accepted release evidence or reopen the
two previously final children. The local Gitleaks and OSV binaries were absent,
so this bounded remediation makes no new security-scan or full-suite claim.

## Verification Plan

Run focused tests for each child, then the project gates in the execution
handoff. At minimum, validate the specs index/frontmatter fixture, typecheck,
full tests, build, `afol local-state rebuild --json`,
`afol validate project --check-drift --json`, `bun run validate:release`, and
required redacted security scans.

## Rollout and Backout

Roll out as additive, governed slices in the F-29 session. If a child cannot
meet its acceptance contract, leave the feature active with the exact failed
evidence and revert only that child’s uncommitted implementation; do not
restore retired runtime surfaces or alter final/reserved feature identifiers.
