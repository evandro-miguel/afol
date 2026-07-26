---
doc_type: spec-child
id: 260726_afol-only-active-canon-migration_spec-child_01
theme: afol-only-active-canon-migration
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Remove legacy configuration from active AFOL authority while preserving explicit fallback compatibility.
created_at: '2026-07-26T17:44:04Z'
updated_at: '2026-07-26T17:44:04Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  spec_test: .afol/adm/specs/F-29/spec-tests/260726_afol-only-active-canon-migration_spec-test_01.md
risk_level: high
---

# SPEC CHILD: AFOL-Only Active Canon Migration

## Intent

- Outcome: `.afol/config.json` is the only active configuration authority in
  the factory, generic fixtures, guidance, and downstream payload.
- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- The finalized canonical-context child remains closed; this child owns only
  active configuration authority and export-boundary cleanup.

## Child Scope Rationale

The runtime resolver already prefers `.afol/config.json` and explicitly
supports `.agents/config.json` only when the canonical file is absent. The
factory still tracks a legacy root config, three generic test fixtures source
that file, and active doctrine/source guidance still presents it as canonical.
Those surfaces can silently preserve two authorities even though the exported
template already ships the AFOL-only layout.

This child migrates active authority without deleting fallback parsing code or
its explicitly named compatibility tests.

## User or Operator Journey

1. An operator enters an AFOL-managed project whose canonical config is
   `.afol/config.json`.
2. Generic test projects and exported downstream payloads use the same
   canonical location; source guidance and doctrine describe the same
   authority.
3. A legacy-only project can still exercise the explicit resolver fallback,
   while the retired factory copy remains verifiable in an AFOL migration
   archive pending retention review.

## Boundaries

- In scope:
  - Reopen only F-29 and this parent while the child is active.
  - Archive the tracked root `.agents/config.json` byte-for-byte under
    `.afol/data/migrations/**` with SHA-256 provenance, retention review, and
    `deletion_approved: false`, then remove it from the active root.
  - Make generic fixtures in `file-command-unit`, `mutation-safety`, and
    `validate-internals` create `.afol/config.json` from the template source.
  - Synchronize the factory `afol-rules` source seed with its canonical
    template copy.
  - Reconcile the project manifesto with the external-operator/downstream
    no-executable contract.
  - Prove template and manifest payloads never export `.agents/config.json`.
- Out of scope:
  - Removing legacy fallback constants, resolver behavior, protected-path
    checks, or explicitly named fallback tests.
  - F-01, F-11, F-13, F-15, legacy-scanner work, hydrate, full-suite,
    benchmark, release, deploy, host cleanup, or direct `main` changes.

## Risks and Mitigations

- Generic fixtures might accidentally stop testing project behavior -> copy
  the canonical template config and retain lock/provider metadata separately.
- Removing the active legacy file could destroy provenance -> verify the
  byte-for-byte archive and manifest checksum before deleting the tracked path.
- Broad search-and-replace could erase explicit compatibility -> limit edits
  to the three generic fixture constructors and preserve fallback tests.
- Generated payloads could drift -> update manifests/template only through
  canonical repository generators and run their checks.

## Acceptance

- [x] `.afol/config.json` is the sole active factory and generic-fixture config.
- [x] The retired root config is preserved byte-for-byte with verified SHA-256,
      retention review metadata, and no deletion approval.
- [x] Explicit legacy fallback code and tests remain intact and named as
      compatibility only.
- [x] The factory and template `afol-rules` source seeds are byte-identical and
      name canonical-first fallback behavior.
- [x] The manifesto defines `afol` as an external operator, root `./afol` as a
      factory development entrypoint only, and no downstream executable.
- [x] Source template, generated template, and manifests exclude
      `.agents/config.json`.
- [x] Focused sequential tests, narrow formatting, typecheck, manifest/template
      checks, and diff check pass without hydrate or heavy gates.

## Closure

Source-only payload parity proves the exact generated template without relying
on external `node_modules`, shims, or mutable symlinks. Redacted Gitleaks
history and worktree scans found no leaks. OSV parsed the unchanged `bun.lock`
but could not perform vulnerability matching because no offline database was
available. `package.json` and `bun.lock` remain unchanged from `532345f`; the
unavailable database is retained as an explicit residual risk, not a pass.
