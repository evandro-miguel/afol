---
doc_type: report
id: 260710_2018_review-followup-integrity_report_01
theme: review-followup-integrity
status: final
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Record the remediation and final validation of thirteen F-22 integrity review findings.
created_at: '2026-07-10T21:30:16-03:00'
updated_at: '2026-07-10T21:30:16-03:00'
roadmap_feature: F-22
parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: 260710_2018_review-followup-integrity_plan_01
  task: 260710_2018_review-followup-integrity_task_01
  postmortem: ''
output_artifacts:
  primary:
    report: 260710_2018_review-followup-integrity_report_01
    task: 260710_2018_review-followup-integrity_task_01
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

# Report: review-followup-integrity

## Governance Context

- Roadmap feature: `F-22`
- Parent spec: `260710_core-integrity-and-transaction-safety_spec_01`
- Child spec: none

## Summary

- Resolved thirteen review findings across bootstrap/update guards, lifecycle warning and transition behavior, duplicate-task verification, governance binding validation, and locked mutation audit correctness.
- Preserved the F-22 fail-closed invariants while adding TOCTOU revalidation, read-only rollback preview, backup path jailing, runtime provenance checks, durable auxiliary warnings, and stricter governance relationships.
- Completed all three delegated tasks with observed execution evidence and passed the final repository gates.

## Delivered Changes

1. Bootstrap now revalidates the canonical target after acquiring the external lock and rejects target replacement or symlink swaps.
2. Update apply now reruns approval, bound-task or CI context, and runtime provenance guards against the locked replan before staging writes.
3. Lifecycle commands preserve a committed primary state change when auxiliary event, telemetry, or index work fails and surface structured warnings instead of ambiguous failure.
4. Update rollback `--dry-run` is read-only and does not restore files or append journal rows.
5. Update rollback validates journal backup paths against the mutation backup jail and rejects lexical or symlink escapes.
6. Start and transition command outputs propagate auxiliary warnings in both human and JSON forms.
7. Transition parsing rejects invalid states and completion-policy values without mutating task state.
8. Transition audit events retain the real `from` and `to` states and report auxiliary failures without falsifying the committed transition.
9. Strict task verification rejects duplicate task IDs inside one session while allowing the same task ID in different sessions.
10. Repository-level verification aggregates session-local evidence without authorizing one session from another session's task ID.
11. Real update rollback validates runtime provenance before any rollback mutation.
12. Governance resolution requires an active roadmap feature, an active unique parent spec, matching `roadmap_feature`, and the roadmap feature's governing-spec relationship.
13. Locked file mutation audit records use the committed task context and preserve correct mutation metadata under concurrent state changes.

## Delegated Task Evidence

- T-01, bootstrap and update mutation guards: `E-20260710202511095-efa1e0` -> observed, `exit_code=0`.
- T-02, lifecycle warnings and repository verification: `E-20260710202306227-06a11a` -> observed, `exit_code=0`. Earlier failed probe `E-20260710202245661-36e812` was superseded and did not authorize completion.
- T-03, governance binding and locked patch audit correctness: `E-20260710202406862-55d56a` -> observed, `exit_code=0`.

## Files Changed

- `cli/commands/bootstrap.ts`, `cli/commands/update.ts`, and focused tests for locked revalidation, rollback preview, backup jail, and provenance.
- `cli/commands/workbench.ts`, `cli/services/workbench/lifecycle.ts`, `cli/services/workbench/verify.ts`, and focused lifecycle/verification tests.
- `cli/services/governance/pending-specs.ts`, `cli/commands/quick-task.ts`, `cli/commands/file.ts`, and focused governance/file/quick-task tests.

## Optional Artifacts

- Brainstorm: not created.
- Research: not created.
- Explorer check: not created.
- Postmortem: not created.

## Verification

- The repository-wide results originally summarized here were provisional orchestration results and are not represented by this session's delegated evidence ledger.
- This session's ledger proves only the delegated focused commands listed below.
- Final integrated authority after all code commits: session `260710_2121_final-core-integrity-validation`, evidence `E-20260710212531821-11150d` -> 1062 tests passed, 0 failed, 8441 assertions; Biome, Oxlint, typecheck, manifest, template, Gitleaks, and OSV gates passed.
- GitNexus had classified the cumulative F-22 diff as critical because its analysis covered more than this bounded follow-up slice.
- Delegated focused evidence:
  - T-01: `bun test cli/tests/bootstrap.test.ts cli/tests/update-command.test.ts` -> passed.
  - T-02: focused lifecycle and verifier suites plus Biome -> passed.
  - T-03: quick-task, spec-gate, file-command tests, and typecheck -> passed.

## Risks / Follow-ups

- Subsequent critics found and fixed evidence-attempt invalidation independent of auxiliary events, trusted-local waiver enforcement, update rollback TOCTOU and corrupt-journal handling, and symlink-alias serialization across bootstrap, update, and file mutations. Those later fixes are covered by the final validation session, not by this session's older evidence.
- GitNexus classified the cumulative diff as critical. Delivery should keep commit boundaries thematic and review the combined lifecycle, mutation, update, bootstrap, and governance contracts together.
- Rollback recovery still depends on mutation backups and preserved bootstrap recovery snapshots remaining readable until the operation reaches a terminal journal state.
- Registry, benchmark catalog, manifests, and generated template payload must remain synchronized when public command contracts change.

## Rollback

- Revert this review-followup together with its corresponding F-22 implementation slice. Avoid reverting only tests or only one side of a coupled command/service contract.
- Restore update and bootstrap files with their focused tests as one unit because lock timing, provenance, journal, and rollback behavior are coupled.
- Restore lifecycle/workbench and verifier changes together to preserve warning and transition-event schemas.
- Restore governance resolver and its tests together to preserve canonical binding hashes and relationship checks.
- After rollback, regenerate manifests/templates as required and rerun the full test, typecheck, lint, secret, vulnerability, and GitNexus gates.

## Output Artifacts (file-first)

- Primary artifact: `260710_2018_review-followup-integrity_report_01`
- Sidecars:
  - brainstorm: not created
  - research: not created
  - explorer_check: not created
  - postmortem: not created
- Sidecar justification: all optional artifacts were not required for this bounded review follow-up.

## Postmortem Link

- Postmortem: not created.

## Lessons

- A guard evaluated before lock acquisition is not sufficient when the locked replan can change the write set.
- Dry-run contracts must be proven by unchanged files and journals, not only by output labels.
- Durable primary commits and auxiliary diagnostics need separate outcome semantics.

---

*Template: `docs/templates/report.md`*
