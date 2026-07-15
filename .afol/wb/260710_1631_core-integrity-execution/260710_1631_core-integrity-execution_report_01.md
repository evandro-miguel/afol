---
doc_type: report
id: 260710_1631_core-integrity-execution_report_01
theme: core-integrity-execution
status: final
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Record the implementation and validation of F-22 core integrity and transaction safety controls.
created_at: '2026-07-10T20:09:23-03:00'
updated_at: '2026-07-10T20:09:23-03:00'
roadmap_feature: F-22
parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
- T-04
- T-05
- T-06
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: 260710_1631_core-integrity-execution_plan_01
  task: 260710_1631_core-integrity-execution_task_01
  postmortem: ''
output_artifacts:
  primary:
    report: 260710_1631_core-integrity-execution_report_01
    task: 260710_1631_core-integrity-execution_task_01
  sidecars:
    brainstorm: ''
    research: ''
    explorer_check: ''
    postmortem: ''
  sidecar_justification:
    brainstorm: not_required
    research: not_required
    explorer_check: not_required
    postmortem: not_required
---

# Report: core-integrity-execution

## Governance Context

- Roadmap feature: `F-22`
- Parent spec: `260710_core-integrity-and-transaction-safety_spec_01`
- Child spec: none

## Summary

- Completed T-01 through T-06 for fail-closed lifecycle authority, concurrent mutation safety, transactional update/bootstrap/governance flows, and strict derived-state handling.
- Replaced nominal or process-local safety controls with observed evidence, formal transitions, canonical locks, hash preconditions, rollback paths, strict readers, and cross-process identifiers.
- Migrated affected tests, benchmark catalog coverage, command help, manifests, and generated template payloads to the hardened contracts.

## Delivered Changes

- T-01: Required observed successful evidence with `exit_code=0`, enforced the formal task-state machine, returned the authorizing evidence ID, and recorded transition audit events.
- T-02: Added resource-path locking, immediate hash preconditions, prepared/committed mutation journal phases, strict corruption handling, safe single-use undo, drift conflicts, and collision-resistant mutation IDs.
- T-03: Serialized scaffold updates under a global lock, replanned inside the lock, preserved project-owned content without blocking compatible updates, normalized unbound journal identity, and added hash-checked batch rollback.
- T-04: Passed operation context into bootstrap/init, approval-gated real writes, added canonical target locking, staged payload validation, exact target snapshots, rollback, structured error boundaries, and symlink rejection.
- T-05: Validated roadmap/spec bindings against real active catalog artifacts, persisted canonical paths and hashes, made governance updates locked and transactional, added explicit index repair, moved pending-spec enforcement to target session start, and made session-context writes strict, locked, and rollback-safe.
- T-06: Required explicit quick-task commands and governance or waiver, removed declared result authority, hardened evidence applicability after invalidating transitions, rejected malformed hydration and duplicate task IDs, corrected status priority and corrupt-session handling, added runtime mutation preflight and structured JSON errors, and moved event IDs to UUID-backed forms.

## Files Changed

- `cli/commands/**`: lifecycle, quick-task, file, update, bootstrap/init, governance, session, status, registry, routing, and help contracts.
- `cli/services/**`: lifecycle verification, session state, locking, mutation journal, update planning, governance, session context, events, and telemetry.
- `cli/tests/**`: focused regression, concurrency, rollback, lifecycle, state, CLI envelope, bootstrap, update, governance, and downstream smoke coverage.
- `.agents/manifest.json` and `src/project-template/.agents/manifest.json`: synchronized public command metadata.
- `cli/generated/template.ts` and benchmark catalog mirrors: synchronized generated payload and coverage contracts.

## Optional Artifacts

- Brainstorm: not created.
- Research: not created.
- Explorer check: not created.
- Postmortem: not created.

## Verification

- The results below are historical and provisional for this execution session. They do not cover later critic-driven corrections or later code commits.
- Full unit/integration suite: `bun test` -> 1040 passed before the final idempotency patch.
- Focused lifecycle regression: lifecycle-focused test command -> 76 passed after the final idempotency patch.
- Typecheck: root will recheck `bun run typecheck` before closure.
- Lint: root will recheck Biome and oxlint before closure.
- Generated contracts: root will recheck manifest and template generation/check commands before closure.
- Security scans were reported during orchestration but were not recorded as observed evidence in this session's ledger.
- Final integrated authority: session `260710_2121_final-core-integrity-validation`, evidence `E-20260710212531821-11150d`, recorded after all F-22 code commits.

## Risks / Follow-ups

- Later critic rounds found and fixed persisted evidence-attempt authority, service-enforced trusted waiver approval, rollback revalidation under resource locks, strict journal corruption handling, and canonical cross-surface target locking. Those fixes are validated only by the final validation session named above.
- The full `bun test` result predates the final idempotency patch. The focused lifecycle suite passed afterward, but the root owner must rerun the complete release gates before closure.
- Durable-first auxiliary warning behavior and impact-based report policy should remain under regression coverage because they cross persistence, event, telemetry, and closure boundaries.
- Transaction rollback depends on recovery snapshots and backups remaining readable until commit or rollback completes. Operators must preserve reported recovery paths when rollback itself fails.
- Benchmark catalog and generated template mirrors must remain synchronized with registry changes.

## Rollback

- Revert the F-22 implementation changes as one coordinated change set. Do not revert individual lifecycle, journal, update, bootstrap, or governance files in isolation because their schemas and tests are coupled.
- Restore generated manifests, benchmark catalog mirrors, and `cli/generated/template.ts` from the same pre-F-22 revision.
- For an interrupted runtime mutation, use its recorded mutation undo or update batch rollback command after verifying current hashes. For bootstrap rollback failure, restore the preserved recovery snapshot reported by the command.
- After source rollback, rebuild AFOL local state and rerun the full typecheck, lint, manifest, template, test, secret, and dependency gates.

## Output Artifacts (file-first)

- Primary artifact: `260710_1631_core-integrity-execution_report_01`
- Sidecars:
  - brainstorm: not created
  - research: not created
  - explorer_check: not created
  - postmortem: not created
- Sidecar justification: all optional artifacts were not required for this implementation session.

## Postmortem Link

- Postmortem: not created.

## Lessons

- Atomic file replacement does not prevent lost updates. Shared resources require canonical locks plus immediate precondition checks.
- Durable state changes need an explicit commit boundary. Auxiliary failures after that boundary must not make successful primary mutations appear unapplied.
- Declared text is metadata, not executable completion authority.

---

*Template: `docs/templates/report.md`*
