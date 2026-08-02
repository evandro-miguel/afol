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
updated_at: '2026-08-02T00:00:00Z'
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
  - .afol/adm/specs/260726_afol-only-active-canon-migration_spec-child_01.md
  - .afol/adm/specs/260726_event-ledger-durability_spec-child_01.md
  - .afol/adm/specs/260726_governance-contract-reconciliation_spec-child_01.md
  - .afol/adm/specs/260727_release-benchmark-timing-and-baseline-contract_spec-child_01.md
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
- `260726_afol-only-active-canon-migration_spec-child_01` owns the bounded
  removal of legacy configuration from active factory authority, generic test
  fixtures, source guidance, and exported-template contracts while preserving
  explicit resolver fallback compatibility and a verified retention archive.
- `260726_event-ledger-durability_spec-child_01` owns the shared global event
  writer, ledger validation, and fail-closed local-state consumption needed
  after the quota-induced partial-append incident.
- `260726_governance-contract-reconciliation_spec-child_01` owns the bounded
  reconciliation of final F-01, F-11, F-13, and F-15 contracts with the
  AFOL-only TypeScript runtime while preserving their exact prior text in a
  verified retention archive.
- `260727_release-benchmark-timing-and-baseline-contract_spec-child_01` owns the
  mutation-safety release timing contract: one compiled release artifact per
  pack run, cold processes on a warm host, real provenance, and
  scenario-specific baselines that fail closed as incomparable when profiles
  do not match.
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

The active-canon migration child is finalized after source-only payload parity,
focused policy and compatibility checks, manifest/project validation, and
redacted Gitleaks history/worktree scans. OSV parsed the unchanged `bun.lock`
but could not match vulnerabilities because no offline database was available;
dependency inputs remain unchanged from `532345f`, so the limitation is an
explicit residual risk rather than a passing scan.

F-29 is reopened only for the event-ledger durability child after a
quota-induced partial append demonstrated that the shared JSONL writer and
consumer trust boundary were not crash-safe. Earlier child evidence remains
final and is not reinterpreted; the parent returns to final only after this
child has focused RED/GREEN and independent quality evidence and the parent
cross-child acceptance, release, and required security gates are current.

The event-ledger durability child is final with its original governed evidence
preserved. The governance-contract reconciliation child is also final in
session `260726_1553_governance-contract-reconciliation` after exact archive
verification, focused regressions, local-state/context rebuild, project drift
validation, typecheck, formatting, manifest, redacted Gitleaks history/worktree,
and OSV dependency scans. These bounded results do not create a new full-suite,
build, release, deployment, or global-install claim.

The release-benchmark timing child is final in session
`260727_2142_release-benchmark-reliability`: mutation-safety scenarios execute
the compiled release artifact with cold processes on a warm host, the synthetic
`baseline-fixture` identity is removed, incomparable profiles fail closed
without regression claims, and focused tests plus a diagnostic `mutation-safety`
pack run passed (`E-20260729113712841-720b1e`). Within the F-29
`release-benchmark-reliability` track, the last persisted `bun run
validate:release` evidence row (`E-20260727234711023-db9f84`) recorded a
failed result, blocked by the pending controlled-host calibration and by absent
OSV Scanner and Gitleaks binaries; this child therefore makes no passing
full-release-gate claim.

F-29 finalizes in session `260801_1641_project-finalization` with observed
closure evidence: the F-32 `workbench-parity` benchmark was repaired and passed
(`E-20260801220611985-6a3c8b`); the release and security closure chain passed —
typecheck, manifest, template, `bun test`, `bun run validate:security:release`,
pstr rebuild, local-state rebuild, and `afol validate project --check-drift
--json` (`E-20260801224617598-39ff6c`); and the governance, context, health,
and benchmark reconciliation chain passed (`E-20260801224926997-12ce2d`). A
separate later PR-review session (`260729_1624_pr75-review-comments`) recorded
a declared `validate:release` pass on a different commit (`5acd495`,
`E-20260729171716177-62a1e1`) followed by observed SIGTERM failures
(`E-20260729171922573-732e0d`, `E-20260729172612411-ebbe3f`); that session
and commit do not authorize the final HEAD and are not used as final release
evidence. Because no passing evidence row exists for the complete `bun run
validate:release` gate at the finalization HEAD — and the `aa6892c`
validate:release statement is an unverified pre-close historical assertion
with no persisted formal validate:release evidence row or artifact and is
intentionally excluded from release/provenance claims — this closure claims no
artifact/release gate pass; a fresh `bun run validate:release` on the final
HEAD remains a required post-close release verification before any
release/provenance claim.

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
