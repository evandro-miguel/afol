---
doc_type: report
id: "260709_1806_lifecycle-integrity-hardening_report_01"
theme: "lifecycle-integrity-hardening"
status: final
owners:
- recovery-report
workstream_intent: "Recover project continuity and harden durable workbench lifecycle behavior."
artifact_purpose: "Record validated lifecycle fixes, execution incidents, and prioritized follow-up work."
created_at: "2026-07-09T23:22:25Z"
updated_at: "2026-07-09T23:22:25Z"
roadmap_feature: "F-18"
parent_spec: "260612_workbench-hydration-and-markdown-projection_spec-child_01"
child_spec: ""
related_tasks:
- "T-01"
- "T-02"
- "T-03"
- "T-04"
links:
  roadmap: ".afol/adm/roadmap/GENERAL-ROADMAP.md"
  plan: "260709_1806_lifecycle-integrity-hardening_plan_01"
  task: "260709_1806_lifecycle-integrity-hardening_task_01"
  postmortem: ""
output_artifacts:
  primary:
    report: "260709_1806_lifecycle-integrity-hardening_report_01"
    task: "260709_1806_lifecycle-integrity-hardening_task_01"
  sidecars:
    brainstorm: ""
    research: ""
    explorer_check: ""
    postmortem: ""
  sidecar_justification:
    brainstorm: not_required
    research: not_required
    explorer_check: not_required
    postmortem: not_required
---

# Report: Lifecycle Integrity Hardening

## Governance Context

- Roadmap feature: `F-18`
- Parent spec: `260612_workbench-hydration-and-markdown-projection_spec-child_01`
- Session: `260709_1806_lifecycle-integrity-hardening`
- Implementation commit: `20e9f599feb4fd1f0b189bcf8d4328e9c185a0dc`

## Current Project State

Durable lifecycle hardening is implemented and committed on `dev`. T-01 through T-04 are done, strict task verification passed, and the governed session is closed. The closed session artifacts and correction lesson form the governance closure slice that follows implementation commit `20e9f59`.

The implementation replaced terminal task-row inference with canonical close metadata, hardened ordered evidence evaluation, preserved closure across diagnostic failures, and aligned bind/switch behavior with durable session state. Release validation passed at the exact implementation commit in a clean clone. After this report's final update, the PSTR and workbench projections were rebuilt and full health returned zero findings.

## Delivered Changes

- `cli/services/workbench/verify.ts` now recognizes only explicit success states, honors non-zero exit codes, and reduces evidence in ledger order.
- `cli/services/workbench/lifecycle.ts` now guards lifecycle mutations under session locks and commits canonical close metadata before non-authoritative diagnostics.
- `cli/commands/session.ts` now rejects bind and switch only when durable close metadata is present.
- `docs/standards/frontmatter.md` now defines canonical workbench closure authority and timestamp requirements.
- Focused regressions cover closure idempotency, crash recovery, missing task files, corrupt metadata, active-pointer preservation, evidence ordering, and session binding.

## Findings

### 1. Durable Closure, Evidence, and Session Binding

- Scope: Workbench evidence reduction, task completion, session closure, and bind/switch behavior.
- Findings: [RESOLVED] Closure authority is canonical task frontmatter; evidence is reduced in ledger order; failed or non-zero-exit evidence blocks completion; terminal rows without close metadata remain bindable.
- Evidence: `cli/services/workbench/verify.ts:349`, `cli/services/workbench/lifecycle.ts:903`, `cli/services/workbench/lifecycle.ts:988`, `cli/services/workbench/lifecycle.ts:1017`, `cli/commands/session.ts:413`, `docs/standards/frontmatter.md:64`, and focused tests in commit `20e9f59`.
- Severity: HIGH
- Recommendation: Keep canonical task metadata authoritative and retain the focused lifecycle and verifier regressions as release gates.
- Next Step: Run `bun test cli/tests/workbench-verify.test.ts cli/tests/workbench-lifecycle.test.ts cli/tests/session-command.test.ts` after any future lifecycle change.

### 2. Implementation and Release Validation

- Scope: Focused tests, full tests, coverage, build determinism, distribution smoke, project validation, and security release checks.
- Findings: [RESOLVED] The implementation commit passed the intended code and release gates; the full suite reported 958 passed and 0 failed.
- Evidence: `.evidence.jsonl` records passed T-03 commands; artifacts are `tmp/validation/test-option-a-final.log`, `tmp/validation/coverage-option-a-final.log`, `tmp/validation/build-deterministic-final.log`, `tmp/validation/validate-project-final.json`, and `dist/security-scan.release.json`. Clean clone `/home/ozy/tmp/afol-release-20e9f59-uXHU7r` is synced at `20e9f59` and passed `bun run validate:release`.
- Severity: LOW
- Recommendation: Preserve serial execution for build and coverage gates that share Bun output paths.
- Next Step: Re-run only the final project health gate after rebuilding the now-stale PSTR index.

### 3. File Mutation Preflight Race

- Scope: Non-dry-run `file patch`, `file move`, `file undo`, and `file archive` authorization against task state.
- Findings: [HYPOTHESIS] A session can close after `assertTaskInProgress` releases its session lock and before the mutation function writes, creating a time-of-check/time-of-use gap.
- Evidence: `cli/commands/file.ts:56-61`, `cli/commands/file.ts:70-75`, `cli/commands/file.ts:82-86`, and `cli/commands/file.ts:95-100` call mutation functions after the locked check in `cli/services/workbench/lifecycle.ts:252-267` has returned.
- Severity: HIGH
- Recommendation: Hold one session-scoped transaction boundary across task-state validation and the underlying mutation commit.
- Next Step: Add `blocks mutation when session closes after preflight` to `cli/tests/file-command-unit.test.ts`, then run `bun test cli/tests/file-command-unit.test.ts -t "blocks mutation when session closes after preflight"`.

### 4. Workbench Index Read-Modify-Write Race

- Scope: Concurrent scoped rebuilds of the global workbench index for different sessions.
- Findings: [HYPOTHESIS] Two session locks do not serialize the shared index; overlapping scoped rebuilds can each load an old snapshot and overwrite the other session's update.
- Evidence: `cli/services/local-state/workbench-index.ts:668-714` loads the global snapshot, merges one `sessionScope`, and writes it without a global index lock. Lifecycle locks are keyed by session.
- Severity: HIGH
- Recommendation: Serialize global index writes or use an atomic merge protocol that re-reads under one index-specific lock.
- Next Step: Add `preserves both session updates when scoped rebuilds overlap` to `cli/tests/local-state-indexes.test.ts`, then run `bun test cli/tests/local-state-indexes.test.ts -t "preserves both session updates when scoped rebuilds overlap"`.

### 5. Validation Benchmark Flake

- Scope: The `bench --pack aliases to validation benchmark contract` test inside combined coverage execution.
- Findings: [HYPOTHESIS] The test is timing-sensitive under combined load; one coverage run returned process status 2, while the isolated test and later serial coverage run passed.
- Evidence: `cli/tests/validation.test.ts:519-534` asserts status before preserving the failed benchmark payload. `tmp/validation/coverage-option-a-final.log` records the later passing coverage gate.
- Severity: MEDIUM
- Recommendation: Capture bounded stdout and stderr on failure, separate alias-routing assertions from timing assertions, and keep production thresholds unchanged until the cause is measured.
- Next Step: Instrument the failing assertion, then run `bun test cli/tests/validation.test.ts -t "bench --pack aliases to validation benchmark contract"` repeatedly and re-run `bun run coverage:check` serially.

### 6. Evidence Provenance Is Caller-Claimed

- Scope: Workbench evidence recording and execution telemetry semantics.
- Findings: `recordEvidence` persists caller-provided command and result values without executing the command, but emits a `tool_exec` telemetry event as if execution occurred.
- Evidence: `cli/services/workbench/lifecycle.ts:915-934` writes caller input directly; `cli/services/workbench/lifecycle.ts:942-951` emits `event_type: "tool_exec"` from that claim.
- Severity: MEDIUM
- Recommendation: Distinguish `evidence_recorded` claims from trusted executor telemetry and require provenance plus captured exit status for execution-backed evidence.
- Next Step: Define the provenance field and telemetry contract before changing the schema, then add focused compatibility tests for claimed and executor-backed evidence.

### 7. Stale Session Lock Denial of Service

- Scope: Recovery when a process dies after creating a session lock file.
- Findings: [HYPOTHESIS] A crash can leave a lock file that causes every later caller to wait 30 seconds and fail indefinitely because lock metadata is diagnostic only.
- Evidence: `cli/services/io/session-lock.ts:16-17` defines the timeout; `cli/services/io/session-lock.ts:74-91` only formats PID and acquisition time; `cli/services/io/session-lock.ts:114-127` retries until timeout without liveness or age recovery.
- Severity: MEDIUM
- Recommendation: Recover only locks whose PID is confirmed dead and whose age exceeds a conservative threshold; quarantine the stale file atomically.
- Next Step: Add `recovers a stale lock owned by a dead process` to a focused session-lock test and validate both stale recovery and live-lock exclusion.

### 8. Prior Session Directory Disappeared

- Scope: Continuity between sessions `260709_1751_lifecycle-integrity-hardening` and `260709_1806_lifecycle-integrity-hardening`.
- Findings: The prior session directory is absent while the global event ledger preserves its creation, T-01 lifecycle, evidence, and T-02 start; the deletion or move cause remains unknown.
- Evidence: Current `test -d .afol/wb/260709_1751_lifecycle-integrity-hardening` exits 1. `.afol/data/events/events.jsonl:3928-3943` preserves the prior session events. The correction is recorded in the current session log.
- Severity: HIGH
- Recommendation: Trace archive and filesystem mutation paths, and add reconciliation that surfaces an event-ledger session whose canonical directory vanishes.
- Next Step: Run `test ! -d .afol/wb/260709_1751_lifecycle-integrity-hardening` and inspect `.afol/data/events/events.jsonl:3928-3943`; do not infer a cause until mutation evidence is found.

### 9. Delegated-Agent Constraint Violations

- Scope: Read-only ownership, forbidden-tool propagation, and parent verification during this execution.
- Findings: Two delegated read-only reviewers attempted writes; one invoked `ragctl` despite the explicit maintenance prohibition. A build also ran concurrently with coverage and caused a transient Bun temporary-file `ENOENT` before serial gates passed.
- Evidence: `docs/lessons/entries/20260709_2019_delegated-agents-inherit-execution-constraints.md` records the delegated violations. Parent-agent command history records the concurrent build and coverage incident; clean serial validation passed afterward.
- Severity: HIGH
- Recommendation: Put owned files, allowed operations, forbidden tools, and output schema in every delegation; interrupt on the first violation; serialize gates that share build outputs.
- Next Step: Add an orchestration regression where a read-only agent is denied file writes and `ragctl`, then run build, coverage, and release gates in an explicit serial queue.

### 10. Derived-State Freshness During Closure

- Scope: Current full project health after workbench and lesson artifacts changed.
- Findings: [RESOLVED] Adding the report first invalidated PSTR, then evidence and closure invalidated the shared workbench index. Rebuilding both derived projections after the final report update restored a clean health result.
- Evidence: The first `health full` returned stale PSTR; the next returned stale `.afol/data/index/workbench.json`; after final `pstr rebuild` and `local-state rebuild`, `tmp/validation/health-full-final.json` recorded zero failures, warnings, or informational findings.
- Severity: HIGH
- Recommendation: Treat PSTR and local-state indexes as finalization projections and rebuild them after the last governed artifact mutation.
- Next Step: Preserve this rebuild order after the last governed artifact mutation in future closure workflows.

### 11. Start Briefing Maintenance and Legacy Warnings

- Scope: Overdue maintenance-review notices and active legacy-reference notices emitted by start briefing.
- Findings: These warnings remain pending and require classification; they are not evidence that every reported legacy reference is forbidden active behavior.
- Evidence: `cli/services/workbench/start-briefing.ts:178-198` reads maintenance and legacy-reference summaries and emits warnings. The current execution observed both warning classes during `start --brief`.
- Severity: MEDIUM
- Recommendation: Review due areas through the maintenance workflow and classify each legacy reference as active-canon violation, intentional compatibility input, migration evidence, or test fixture before editing.
- Next Step: Run `bun run kernel -- maintenance weekly --dry-run --json`, then inspect the bounded legacy-reference file list; do not bulk replace compatibility or fixture references.

## Prioritized Resumption Plan

1. Blockers: None remain; final derived-state health returned zero findings.
2. Logic Bugs: Reproduce and close the file-mutation TOCTOU gap and the global workbench-index race before broadening concurrent lifecycle use.
3. Active Feature Pendings: Commit the closed session artifacts and correction lesson, then validate the exact final commit in a clean clone.
4. Structural Risks: Define evidence provenance, implement conservative stale-lock recovery, and investigate the vanished session directory.
5. Refactoring and Cleanup: Improve benchmark failure diagnostics, classify start-briefing warnings, and preserve serial validation scheduling.

## First Recommended Action

Commit the closed governance slice, then validate the exact final commit in a clean clone. This is first because implementation, closure, and derived-state health now pass; commit-level release validation is the remaining publication gate.

## Verification Summary

- Focused lifecycle tests: passed.
- Full test suite: 958 passed, 0 failed.
- Coverage gate: passed in the final serial run.
- Deterministic build and distribution smokes: passed.
- Release security scan: passed.
- Clean-clone `validate:release` at `20e9f59`: passed.
- Final full health: passed with zero findings after rebuilding PSTR and local state.

## Output Artifacts

- Primary artifact: `260709_1806_lifecycle-integrity-hardening_report_01.md`
- Optional sidecars: not required.
- Postmortem: not created.

---

*Template: `docs/templates/report.md`*
