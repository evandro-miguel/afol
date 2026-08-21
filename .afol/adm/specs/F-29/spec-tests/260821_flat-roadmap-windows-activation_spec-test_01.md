---
doc_type: spec-test
id: 260821_flat-roadmap-windows-activation_spec-test_01
theme: flat-roadmap-windows-activation
status: active
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Define focused regression proof for flat roadmap compatibility, Windows containment, and fail-safe feature activation.
created_at: '2026-08-21T14:00:20Z'
updated_at: '2026-08-21T14:00:20Z'
roadmap_feature: F-29
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
child_spec: 260821_flat-roadmap-windows-activation_spec-child_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  child: .afol/adm/specs/260821_flat-roadmap-windows-activation_spec-child_01.md
risk_level: high
---

# SPEC TEST: Flat Roadmap, Windows Containment, and Fail-Safe Activation

## Intent

- Journey or behavior under test: an AFOL operator resolves governance and
  activates a planned feature from a Windows-native checkout using either
  supported roadmap layout.
- Why this test strategy is needed now: the source resolver previously assumed
  the nested roadmap path while downstream templates can ship the flat path.
  Ordered parent-first activation must also be proven as convergent rather than
  advertised as a multi-file atomic transaction.
- Related feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Journey

- Primary user or operator: AFOL operator or agent using a local project root
- Entry point: governance catalog resolution or `afol gov af`
- Exit condition: the correct roadmap/spec statuses converge, or validation
  fails with all governed documents unchanged. An interruption may leave the
  parent active and roadmap feature planned until retry.

## Clicks and Commands

- UI click path: not applicable
- CLI or API command path:
  1. `bun test cli/tests/spec-gate-system.test.ts cli/tests/governance-command.test.ts`
  2. `bun run typecheck`
  3. `bun run kernel -- v project --json`
  4. `bun run kernel -- local-state rebuild --json`
- Inputs and fixtures:
  - Isolated project root with nested `GENERAL-ROADMAP.md`
  - Isolated project root with flat `.afol/adm/roadmap.md`
  - Planned roadmap feature and matching planned parent spec
  - Final, mismatched, duplicate, traversal, absolute, and missing parent
    references
  - Windows drive-qualified and separator variants that remain project-local

## Recommended Technology

- Primary test layer: integration
- Recommended tools: `bun:test` and temporary filesystem fixtures
- Notes on why this technology is preferred:
  - The contract is filesystem- and CLI-bound; in-process fixtures can prove
    exact byte preservation on failure without touching host state.

## Test Construction Strategy

- Test structure:
  - Setup: create disposable project roots and governance documents
  - Exercise: resolve the catalog, then invoke `activate-feature` with long and
    compact flags
  - Assert: selected roadmap path, status results, containment failures, and
    byte-for-byte preservation on rejected validation. For an observed write
    error, assert the restoration attempt and reported outcome; do not require
    crash-time rollback.
  - Teardown: remove only the disposable fixture
- Coverage focus:
  - Happy path: nested and flat layouts resolve and activate deterministically
  - Compatibility boundary: flat layout is used only when nested layout is
    absent
  - Validation boundary: invalid parent status or binding leaves the roadmap
    and parent spec unchanged
  - Convergence boundary: parent activation precedes roadmap activation;
    interruption can produce parent `active`/feature `planned`, and retry is
    idempotent and completes the transition
  - Lifecycle boundary: active is a no-op and final cannot be reopened
  - Windows boundary: foreign, traversal, symlink, junction, and reparse-point
    roadmap paths are rejected before reads or writes

## Expected Result

- Functional result: both supported roadmap layouts produce the same governed
  feature/spec behavior; rejected validation does not mutate state; and an
  interrupted ordered activation can be retried to convergence.
- Non-functional expectation: deterministic, offline, project-contained, and
  independent of the installed global AFOL binary.
- Failure messaging expectation: identify the invalid layout, feature, parent,
  or containment condition and provide a safe corrective action.

## Evidence Plan

- Evidence format in report:
  - Command output snippets: no
  - Screenshots or recordings: no
  - Logs or metrics: yes, through AFOL command evidence IDs
- Pass/fail rule:
  - RED must fail for flat-roadmap resolution or missing convergence behavior
    before the production correction; GREEN plus typecheck, frontmatter
    validation, and diff check must pass. Evidence must show parent-first order,
    the documented intermediate state or injected write error, retry
    convergence, and rejection of symlink/junction/reparse roadmap paths.
- Report link target:
  - Governed F-29 workbench report created through the AFOL lifecycle

## Risks and Follow-ups

- Open risk: old downstream projects may contain both roadmap layouts or a
  redirected roadmap path -> Follow-up: keep nested-first precedence explicit,
  reject symlink/junction/reparse paths, and add a duplicate-layout diagnostic
  if product behavior later requires it.
- Open risk: a process crash after parent activation can leave the parent
  `active` while the feature is `planned` -> Follow-up: expose retry guidance
  and verify idempotent convergence; do not describe this as atomic rollback.
- Deferred case: global installation and release promotion -> Owner: AFOL
  release lane after main integration.

## Acceptance

- [ ] Journey and command path are explicit.
- [ ] Nested, flat, Windows path-link rejection, validation, and convergence
      boundaries are covered.
- [ ] Evidence records parent-first ordering, the possible intermediate state,
      retry convergence, and the observed-error restoration attempt.
- [ ] Focused tests and project validation are green.
- [ ] Evidence is recorded in the governed F-29 workbench report.
