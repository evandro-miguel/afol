---
doc_type: spec-child
id: 260821_flat-roadmap-windows-activation_spec-child_01
theme: flat-roadmap-windows-activation
status: active
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Define the bounded governance compatibility and fail-safe feature-activation contract for downstream AFOL projects.
created_at: '2026-08-21T14:00:20Z'
updated_at: '2026-08-21T14:00:20Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  spec_test: .afol/adm/specs/F-29/spec-tests/260821_flat-roadmap-windows-activation_spec-test_01.md
risk_level: high
---

# SPEC CHILD: Flat Roadmap, Windows Containment, and Fail-Safe Activation

## Intent

- Outcome: governance resolution works against both the canonical nested
  roadmap and the supported flat `.afol/adm/roadmap.md` layout, while feature
  activation remains contained to the project and converges the roadmap
  feature with its parent spec through ordered, idempotent mutations.
- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Child Scope Rationale

Downstream scaffolds can legitimately retain the flat roadmap payload shipped
by older templates, while the AFOL source repository uses the nested roadmap
layout. The resolver must support both layouts without weakening canonical
path checks. Windows-native operators also need the same behavior without
host-global path assumptions. The activation contract is kept in this child
because roadmap status and parent-spec status form one governance transition.

## Required Behavior

- Resolve the nested `.afol/adm/roadmap/GENERAL-ROADMAP.md` first and fall back
  to `.afol/adm/roadmap.md` when the nested file is absent.
- Resolve both roadmap layouts with nested-first precedence, reject ambiguous
  spec references and unsafe paths, and never search outside the configured
  project root or treat legacy runtime folders as governance.
- Accept `activate-feature` through its long form and `afol gov af` alias with
  `-F/--feature-id`; accept optional `-P/--parent-spec` when the parent spec
  must transition with the roadmap feature.
- Validate feature status, parent identity, roadmap feature binding, and all
  target paths before writing. A failed validation leaves every target
  unchanged. Reject the selected roadmap or any containing path component
  when it is a symlink, junction, or other reparse point.
- Activate the parent spec first, then the roadmap feature. This is fail-safe
  and idempotent convergence, not multi-file atomicity. An interruption may
  leave the parent `active` while the feature remains `planned` and therefore
  temporarily non-governable; retrying the command completes convergence.
- If a write error is observed, attempt restoration of the mutation already
  made and report the result. Crash safety relies on the ordered writes, not on
  a guaranteed rollback or atomic multi-file commit.
- Preserve the existing no-op behavior for an already-active feature and the
  fail-closed behavior for final or otherwise invalid governance records.

## Boundaries

In scope:

- Governance roadmap discovery and catalog resolution for nested and flat
  layouts.
- `activate-feature` argument aliases, parent-spec validation, project-root
  containment, and multi-file mutation behavior.
- Focused governance/spec-gate tests, frontmatter/index validation, typecheck,
  formatting, and project-local AFOL validation.

Out of scope:

- Roadmap history edits, broad governance redesign, or new feature IDs.
- Product repositories' application code, global AFOL installation, deployment,
  Windows host configuration, network services, or production data.
- Retiring the flat roadmap compatibility path or restoring discontinued
  `.agents` runtime surfaces.

## Risks and Mitigations

- Two roadmap layouts can drift -> use deterministic nested-first fallback and
  exercise both layouts in isolated fixtures.
- An interruption can split governance state -> validate all inputs first,
  write the parent before the roadmap, document the temporary non-governable
  state, and prove retry convergence. An observed error should attempt
  restoration, but the ordered protocol is the crash-safety boundary.
- Windows path handling can escape the project root or redirect through a
  filesystem link -> normalize and reject absolute, traversal, and foreign-root
  references plus symlink, junction, and other reparse-point roadmap paths
  before file access.

## Acceptance

- [ ] Nested and flat roadmap fixtures resolve to the same governance catalog.
- [ ] Unsafe or ambiguous paths, including symlink, junction, and reparse-point
      roadmap paths, fail closed without mutation.
- [ ] `afol gov af -F <F-id> -P <spec-id>` validates all targets, activates the
      planned parent before the planned roadmap feature, and reports the
      ordered result without claiming multi-file atomicity.
- [ ] An interruption or observed write error is covered: the documented
      intermediate state is parent `active`/feature `planned`, retry is
      idempotent and converges, and any attempted restoration is reported.
- [ ] Already-active and final statuses retain their documented no-op/error
      behavior.
- [ ] Focused tests, typecheck, project validation, and documentation checks
      pass on the exact change.

---

*Template: `docs/templates/spec-child.md`*
