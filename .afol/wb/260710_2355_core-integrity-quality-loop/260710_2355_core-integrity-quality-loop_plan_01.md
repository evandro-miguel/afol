---
doc_type: "workbench_plan"
id: "260710_2355_core-integrity-quality-loop_plan_01"
session_id: "260710_2355_core-integrity-quality-loop"
theme: "core-integrity-quality-loop"
status: "active"
created_at: "2026-07-11T03:55:52.476Z"
updated_at: "2026-07-11T03:55:52.476Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01,T-02,T-03,T-04,T-05"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: core-integrity-quality-loop

## Objective

Finish the project through small, test-first, independently reviewed remediation slices. Every one of the 29 canonical findings has one primary owner. F-22 work stays inside its active parent spec. Scope-gated or out-of-F-22 work is routed to a named future governed feature and is never silently deferred.

## State and Pre-Execution Contract

- State Board authority: `T-01` and `T-02` are done; `T-03` is in progress.
- Baseline: 474 focused tests passed and 0 failed. Ten proposed red repros exist in `handoffs/baseline-test-design-001.json`.
- GitNexus is fresh at `d7db715`. Initial graph evidence: `transitionTask` has 5 upstream consumers; `selectSections` has 3; `runNewCommand` has 2. Re-run `gitnexus status`, then impact each edited exported symbol before code changes.
- The pre-execution critic first returned `REVISE`, then authorized C01-R. The C01-R reviewer returned `PASS`. The authority/scope critic returned `GO` in `reports/c01-authority-critic-005.json`, and the F-22 governance owner accepted `STOP-C01-AUTHORITY` plus the active S-C01-I child spec. Other production slices remain blocked pending their own governing acceptance.
- Only one primary slice may claim a canonical finding ID. Dependencies may mention an ID but do not claim closure.

## Non-Goals

- Do not revive the retired `.agents` runtime or add a downstream `afol` wrapper.
- Do not broaden F-22 into an unapproved database engine, Windows support program, adapter redesign, or knowledge-store rewrite.
- Do not create the proposed roadmap/spec artifacts in this planning task.
- Do not close F-22, release, merge to `main`, or deploy from this plan.

## Invariants

- Denied actions must not read, preview, back up, journal, or write protected data.
- A successful result must name a legal state transition and its current authority.
- Hash, lock, journal, and rollback checks run at the shared-resource boundary, not only at planning time.
- Corruption is typed and preserved. Repair is explicit.
- Every mutable slice has one writer, red proof first, focused tests, independent review, one atomic commit, and a push to `origin dev`.
- Revert with `git revert <slice-commit>`; never reset shared history. Re-run that slice's focused gate after revert.

## Governance Decisions and Routing

The critic returned `REVISE`. The active C01-R checkpoint is the sole exception below. All other routes remain proposals until their governing acceptance.

| Route | Proposed governing artifact | Canonical primary IDs |
| --- | --- | --- |
| F22-C01-R checkpoint | `.afol/adm/specs/260711_c01-authorization-red-reproducers_spec-child_01.md` | C01 route retains CF-P0-03, CF-P0-05, CF-P0-06, CF-P0-07, CF-P1-22 |
| F22-C02A | `.afol/adm/specs/260711_canonical-context-and-tool-contract_spec-child_01.md` | CF-P0-01, CF-P1-01 |
| F22-C02B/C03 | `.afol/adm/specs/260711_governance-and-workbench-transaction-integrity_spec-child_01.md` | CF-P0-02, CF-P1-12, CF-P1-13 |
| F22-C03 bootstrap | `.afol/adm/specs/260711_bootstrap-staging-integrity_spec-child_01.md` | CF-P1-10 |
| F22-C03 publication | `.afol/adm/specs/260711_workbench-publication-integrity_spec-child_01.md` | CF-P1-11 |
| F22-C04 v1 proof | `.afol/adm/specs/260711_v1-materialization-completeness_spec-child_01.md` | CF-P0-04 |
| F22-C05 | `.afol/adm/specs/260711_multi-agent-worktree-isolation_spec-child_01.md` | CF-P1-16, CF-P1-21 |
| F22-C07 | `.afol/adm/specs/260711_command-envelope-and-index-measurement_spec-child_01.md` | CF-P1-04, CF-P1-07 |
| F-23 proposed: Decision history integrity | `.afol/adm/specs/260711_decision-history-concurrency_spec_01.md` | CF-P1-02, CF-P1-03, CF-P1-20 |
| F-24 proposed: Runtime contract documentation | `.afol/adm/specs/260711_runtime-contract-documentation_spec_01.md` | CF-P1-05 |
| F-25 proposed: State DB v2 and durable events | `.afol/adm/specs/260711_state-db-v2-and-durable-event-integrity_spec_01.md` | CF-P1-06, CF-P1-08, CF-P1-14, CF-P1-15 |
| F-26 proposed: Windows/WSL command contract | `.afol/adm/specs/260711_windows-wsl-command-contract_spec_01.md` | CF-P1-09 |
| F-27 proposed: Adapter control-plane integrity | `.afol/adm/specs/260711_adapter-control-plane-transaction-integrity_spec_01.md` | CF-P1-17 |
| F-28 proposed: Memory and library integrity | `.afol/adm/specs/260711_memory-library-integrity_spec_01.md` | CF-P1-18, CF-P1-19 |

F-25 requires a roadmap/spec amendment before implementation because `AGENTS.md` reserves broader State DB materialization for v2/future. F-26 requires a defined Windows runner. F-27 depends on C01's centralized authorization but owns the later transaction contract. F-23, F-24, and F-28 are named owner features rather than F-22 overflow.

## Dependency DAG and Parallelism

```text
C01-R red proofs -> STOP-C01-AUTHORITY governance decision -> C01-I implementation
C01 -> { C02A context/catalog, C02B+C03 governance/lifecycle }
C02B+C03 -> { C03 bootstrap, C03 publication, C04 v1 proof, C05 }
C01 -> C07 envelope; C03 publication -> C07 index measurement
C01 + C02B+C03 -> F-23 and F-27; C01 -> F-24/F-28; C05 -> F-26 host evidence
all accepted F-22 routes + mutation-policy decision + accepted Windows/F-23-through-F-28 exclusions -> C08 release/closure
```

- Safe parallel lanes after C01's contract is frozen: C02A and the read-only design of C03 bootstrap/publication. They use separate Linux-side worktrees and do not edit `cli/registry.ts`, `cli/router.ts`, `cli/main.ts`, lifecycle/session context, or generated payloads concurrently.
- C02B and C03 lifecycle work are serialized under one integration writer. C05 is serialized after them. F-25 and F-26 are blocked, not parallel implementation lanes.
- Until C05 is accepted, one mutation host owns each worktree. Windows and WSL never share a worktree or lock root.

## Executable Test-First Slices

### S-C01 Combined action-authority route

- Primary IDs remain CF-P0-03, CF-P0-05, CF-P0-06, CF-P0-07, and CF-P1-22. The primary mapping remains `S-C01`; only the first child slice is authorized.

#### S-C01-R Red-test checkpoint

- Governance: active child spec `.afol/adm/specs/260711_c01-authorization-red-reproducers_spec-child_01.md`. Owner: one `c01-red-test-writer`; reviewer: one independent read-only `c01-red-test-reviewer`.
- Write scope: only `cli/tests/kernel.test.ts`, `cli/tests/operation-context.test.ts`, `cli/tests/registry.test.ts`, `cli/tests/router.test.ts`, `cli/tests/file-command-unit.test.ts`, and `cli/tests/mutation-safety.test.ts`.
- Red proofs: `R-02`, `SEC-001`, `SEC-003`, `SEC-004`, and `SEC-006` only. Each uses explicit `--agent` input and a non-secret fixture. `SEC-002` final capability assertions are forbidden.
- Source behavior command: `bun test cli/tests/kernel.test.ts cli/tests/operation-context.test.ts cli/tests/registry.test.ts cli/tests/router.test.ts cli/tests/file-command-unit.test.ts cli/tests/mutation-safety.test.ts`.
- Expected red failures are evidence of current behavior, not task completion, implementation acceptance, or authority to close C01/T-02/F-22. The independent reviewer verifies scope, fixtures, and failure meaning before the result is recorded.
- Forbidden: production source, generated payloads, manifests, configuration, capability/launcher contract, release work, and test-shell exposure. Roll back only the red-test commit with `git revert <red-test-checkpoint-commit>`.

#### STOP-C01-AUTHORITY Governance decision

- Owner: F-22 governing parent-spec owner. Artifact: an accepted revision of the C01 child spec or a linked accepted F-22 ADR; the critic is reviewer only and cannot issue the decision.
- Required fields: issuer/trust boundary, audience, expiry/renewal, revocation, replay protection, verification, audit, local-operator fallback, and test-shell policy.
- Accepted boundary: direct invocation is the deployment local-operator path. Explicit agent and remote contexts are restrictive policy modes only. CLI inputs, owners, and actors are not authenticated authority. Same-account process isolation requires a future external trust root and remains unclaimed.

#### S-C01-I Production implementation

- Accepted dependency: `STOP-C01-AUTHORITY` contains every required field and `260711_c01-action-policy-and-protected-resources_spec-child_01` is the separately accepted implementation scope.
- Proposed write scope after that gate: `cli/core/operation-context.ts`, `cli/main.ts`, `cli/registry.ts`, `cli/router.ts`, `cli/commands/file.ts`, `cli/commands/file/shared.ts`, `cli/services/workbench/lifecycle.ts`, and only necessary tests in the six C01 test files.
- Outcome and acceptance: one action-policy dispatch gate applies immutable restrictive-mode context before real mutators; protected AFOL and sensitive paths are denied before I/O; denials create no persistent audit and return the structured `approval-required` envelope with exit code `2`; `recordEvidence` replaces values for the seven accepted assignment/long-option names with `[REDACTED]` once and persists the identical sanitized command in evidence and events; `SEC-002` remains a deployment-boundary limitation rather than an identity guarantee.
- Closed action matrix: all five ADR write actions, ADM migrate preview/apply, `spec.waive`, `changelog.add`, `state.sync`, `hydrate.run`, adapter enable/disable preview and apply, file patch/move/archive/undo preview and apply, `workbench.evidence.record`, and the three workbench done variants use the exact normalization, mode, and denial contract in `260711_c01-action-policy-and-protected-resources_spec-child_01`. Unlisted actions retain current handler policy.
- Protected resources: generic file patch, move, and archive deny `.afol/adm/**`, `.afol/wb/**`, `.afol/state/**`, `.afol/data/mutations/**`, the four exact AFOL/provider config files, `.env*`, the listed credential-store basenames, and the four listed key/certificate extensions before operand I/O. Restricted undo denies before journal reads; local undo retains existing journal validation.
- Compatibility and redaction oracle: move only the three generic file probe defaults to `.afol/tmp/file-command/**`; assignment keys match the seven classifier names exactly or by `_<name>` suffix, long options match the exact normalized name, and focused synthetic cases cover `DEMO_API_KEY`, `--api-key`, `--token=`, and the `API_KEY_NOTE` non-match.
- Gates: GitNexus impact for `resolveOperationContext`, focused source behavior command, `bun run typecheck`, `bun run manifest:check`, and `git diff --check`.
- Commit/push/rollback: after independent review, `fix(f22): enforce action authority and protected resources`, push to `origin dev`; implementation-only rollback must restore the documented 7 kernel and 5 mutation red outcomes while the nearest prior baseline groups remain green, not claim a green complete six-file suite.

### S-C02A Canonical context and tool contract

- Primary IDs: CF-P0-01, CF-P1-01. Owner: context/catalog executor; reviewer: context critic.
- Write scope: `cli/commands/context.ts`, `cli/services/context/{bundler,section-index}.ts`, `cli/commands/catalog.ts`, `cli/dev/generate-manifest.ts`, `.afol/adm/tools.json`, `cli/tests/{context-system,registry,help,spec-gate-system}.test.ts`.
- Red proofs first: R-10, R-05, R-04. Run `bun test cli/tests/context-system.test.ts cli/tests/spec-gate-system.test.ts cli/tests/registry.test.ts cli/tests/help.test.ts`.
- Outcome and acceptance: only canonical `.afol/adm` authority can satisfy trusted context or spec checks; archive content is history only; normalized live registry and tools catalog are semantically equal.
- Gates: impact `Function:cli/services/context/bundler.ts:selectSections`; focused command; `bun run manifest:check`; `bun run template:check`; `bun run typecheck`; `git diff --check`.
- Commit/push/rollback: one context commit, then a separate catalog-generation commit only if required; critic GO before each; push each to `origin dev`; revert the relevant commit and rerun the command.
- Dependency: C01 contract is frozen. Do not edit registry/router concurrently with C01 or C02B/C03 integration.

### S-C02B/C03 Governance binding and lifecycle evidence transaction

- Primary IDs: CF-P0-02, CF-P1-12, CF-P1-13. Owner: one lifecycle integration executor; reviewer: lifecycle critic.
- Write scope: `cli/commands/{workbench,governance,session}.ts`, `cli/services/governance/pending-specs.ts`, `cli/services/workbench/**`, `cli/services/state/session-state.ts`, `cli/tests/{kernel,session-command,workbench-lifecycle,workbench-verify,state-sqlite}.test.ts`.
- Red proofs first: R-01 plus process-barrier fixtures for governance/start and done/execution-attempt binding. Run `bun test cli/tests/kernel.test.ts cli/tests/session-command.test.ts cli/tests/workbench-lifecycle.test.ts cli/tests/workbench-verify.test.ts cli/tests/state-sqlite.test.ts`.
- Outcome and acceptance: normal `new` rejects fictitious/inactive/unlinked authority before creating a session; governance and start share one lock domain; `done` accepts only evidence from the current execution attempt.
- Gates: impact `Function:cli/commands/workbench.ts:runNewCommand` and each edited lifecycle symbol; focused command; `bun run typecheck`; `git diff --check`.
- Commit/push/rollback: review governance binding and evidence transaction as separate commits; integrate only after their combined command passes; push reviewed commits to `origin dev`; revert in reverse dependency order.
- Dependency: C01 and an explicit compatibility rule for existing sessions/evidence. Keep F-18 command-error delivery out of this slice.

### S-C03B Bootstrap staging integrity

- Primary ID: CF-P1-10. Owner: bootstrap executor; reviewer: recovery critic.
- Write scope: `cli/commands/bootstrap.ts`, `cli/services/bootstrap/**` if present, `cli/tests/bootstrap.test.ts`.
- Red proof first: a fixture with untouched target files proves rollback snapshots only the planned/touched set and leaves unrelated bytes unchanged. Run `bun test cli/tests/bootstrap.test.ts cli/tests/update-command.test.ts`.
- Outcome and acceptance: approval-gated staging records only owned/touched paths and restores exact bytes after injected pre-commit and commit failures.
- Gates: impact `Function:cli/commands/bootstrap.ts:runBootstrapCommand`; focused command; `bun run typecheck`; `git diff --check`; security critic checks no target is read before approval.
- Commit/push/rollback: `fix(f22): stage bootstrap recovery by touched path`, push `origin dev` after review; revert the commit and rerun bootstrap tests.
- Dependency: C02B/C03 transaction contract. Stop if a fixture requires copying the whole target to preserve an unmodeled external side effect.

### S-C03W Workbench publication integrity

- Primary ID: CF-P1-11. Owner: local-state executor; reviewer: concurrency critic.
- Write scope: `cli/commands/local-state.ts`, `cli/services/local-state/{workbench-index,project-indexes}.ts`, `cli/services/workbench/**`, `cli/tests/{local-state-indexes,workbench-lifecycle,session-command}.test.ts`.
- Red proof first: independent reader/writer barrier demonstrates no torn index or partial session publication. Run `bun test cli/tests/local-state-indexes.test.ts cli/tests/workbench-lifecycle.test.ts cli/tests/session-command.test.ts`.
- Outcome and acceptance: publication has an atomic snapshot boundary and reader classification is typed rather than silently fresh.
- Gates: impact `Function:cli/services/local-state/workbench-index.ts:rebuildWorkBenchIndex`; focused command; `bun run typecheck`; `git diff --check`.
- Commit/push/rollback: `fix(f22): publish complete workbench indexes`, push `origin dev` after critic GO; revert and rerun index tests.
- Dependency: C02B/C03. C07 index measurement consumes this result; do not combine the commits.

### S-C04A v1 materialization completeness

- Primary ID: CF-P0-04. Owner: state executor; reviewer: persistence critic.
- Write scope: `cli/services/state/{db,session-state}.ts`, `cli/tests/state-sqlite.test.ts`.
- Red proof first: R-03 deletes canonical task/evidence rows without changing source files. Run `bun test cli/tests/state-sqlite.test.ts`.
- Outcome and acceptance: v1 validation detects missing canonical rows as a typed integrity mismatch and cannot report fresh.
- Gates: impact every edited state symbol; focused command; `bun run typecheck`; `git diff --check`.
- Commit/push/rollback: `fix(f22): detect incomplete state materialization`, push `origin dev` after critic GO; revert and rerun R-03.
- STOP: implementation needs a written decision that this bounded v1 completeness repair does not introduce a v2 migration. Otherwise route it to F-25 before code.

### S-C05 Multi-agent worktree isolation

- Primary IDs: CF-P1-16, CF-P1-21. Owner: concurrency executor; reviewer: isolation critic.
- Write scope: `cli/core/operation-context.ts`, `cli/commands/{session,workbench}.ts`, `cli/services/{workbench,io/session-lock}.ts`, `cli/tests/{operation-context,session-lock,workbench-lifecycle,operator-journeys}.test.ts`.
- Red proofs first: same-task/different-actor, fallback-session, expired-lease, host-mismatch, and takeover barriers. Run `bun test cli/tests/operation-context.test.ts cli/tests/session-lock.test.ts cli/tests/workbench-lifecycle.test.ts cli/tests/operator-journeys.test.ts`.
- Outcome and acceptance: actor authority is launcher-bound if it is authorization-bearing; host-local locks state a fail-closed one-host boundary or implement an approved takeover protocol.
- Gates: impact `transitionTask`, `resolveSession`, and `withSessionContextLock`; focused command; `bun run typecheck`; `git diff --check`.
- Commit/push/rollback: resolver/deny behavior and lease/takeover are separate reviewed commits, each pushed to `origin dev`; revert the latest dependent commit first.
- Dependency: C01 and C02B/C03. Stop if task owner remains informational or cross-host storage is not approved; retain one-host-per-worktree policy.

### S-C07A JSON error envelope

- Primary ID: CF-P1-04. Owner: command-contract executor; reviewer: API-contract critic.
- Write scope: `cli/core/envelope.ts`, `cli/main.ts`, affected `cli/commands/{adr,changelog,io}.ts`, `cli/tests/{envelope,spec-gate-system,adm-paths}.test.ts`.
- Red proof first: R-08 plus root-detection and command-error matrix. Run `bun test cli/tests/envelope.test.ts cli/tests/spec-gate-system.test.ts cli/tests/adm-paths.test.ts`.
- Outcome and acceptance: every covered `--json` failure emits exactly one `afol.result/v1` error on stdout and no plain-text stderr error.
- Gates: impact each edited command boundary; focused command; `bun run typecheck`; `git diff --check`.
- Commit/push/rollback: `fix(f22): normalize JSON command failures`, critic GO, push `origin dev`, and revert as one contract commit if needed.
- Dependency: C01 ActionSpec error routing. Do not use this slice for a broad output redesign.

### S-C07B Measured files-index repair

- Primary ID: CF-P1-07. Owner: performance executor; reviewer: benchmark critic.
- Write scope: `cli/services/local-state/project-indexes.ts`, direct lifecycle callers, `cli/tests/local-state-indexes.test.ts`, benchmark scenario metadata approved by the critic.
- Red proof first: a bounded multi-session fixture measures full-scan and stale-publication behavior. Run `bun test cli/tests/local-state-indexes.test.ts cli/tests/telemetry-command.test.ts`.
- Outcome and acceptance: targeted rebuilds preserve concurrent state and a before/after benchmark meets the approved ceiling without weaker freshness checks.
- Gates: impact `Function:cli/services/local-state/project-indexes.ts:rebuildFilesIndex`; focused command; `bun run kernel -- pb validate --strict --json`; `git diff --check`.
- Commit/push/rollback: `perf(f22): bound files-index rebuild scope`, critic GO, push `origin dev`; revert if the measured ceiling or freshness oracle regresses.
- Dependency: C03W. Stop if no measured regression exists or expanding persistence changes require F-25.

### S-F23 Decision history and administration concurrency

- Primary IDs: CF-P1-02, CF-P1-03, CF-P1-20. Owner: F-23 executor; reviewer: decision-history critic.
- Write scope: `cli/services/spec-gate/{checker,adr,changelog}.ts`, `cli/commands/adr.ts`, `cli/services/workbench/lifecycle.ts` only for approved close integration, `cli/tests/{spec-gate-system,workbench-lifecycle}.test.ts`.
- Red proofs first: R-06, R-07, R-09 and independent ADR-ID/changelog barriers. Run `bun test cli/tests/spec-gate-system.test.ts cli/tests/workbench-lifecycle.test.ts`.
- Outcome and acceptance: corrupt stores preserve bytes and fail typed; close honors required conflict state; supersede validates `--by`; decision IDs and changelog entries serialize without loss.
- Gates: impact every edited spec-gate/close symbol; focused command; `bun run typecheck`; `git diff --check`.
- Commit/push/rollback: one commit per data model (`spec-gate`, `ADR/changelog`), critic GO, push each to `origin dev`; revert in reverse dependency order.
- Dependency: create F-23 parent spec after critic GO. It is not an unapproved F-22 C06 omnibus.

### S-F24 Runtime contract documentation alignment

- Primary ID: CF-P1-05. Owner: governance/docs executor; reviewer: governance critic.
- Write scope: `AGENTS.md`, `README.md`, `docs/afol-runtime-reference.md`, and one focused documentation-contract test only if the critic accepts a test surface.
- Red proof first: retain the existing runtime oracle with `bun test cli/tests/workbench-lifecycle.test.ts`; demonstrate the three conflicting statements before editing.
- Outcome and acceptance: documents say pending governance blocks only the affected session at `start`; unrelated `new` remains allowed.
- Gates: `git diff --check`; reviewer compares every assertion to F-22 acceptance and the lifecycle test.
- Commit/push/rollback: `docs(f24): align pending-spec runtime contract`, critic GO, push `origin dev`; revert the documentation-only commit if runtime evidence changes.
- Dependency: create F-24 after critic GO. No runtime change is authorized here.

### S-F25 State DB v2 and durable event integrity

- Primary IDs: CF-P1-06, CF-P1-08, CF-P1-14, CF-P1-15. Owner: F-25 persistence executor; reviewer: migration/recovery critic.
- Write scope: `cli/services/state/{db,session-state}.ts`, `cli/services/{events,local-state,mutations}/**`, migration fixtures, `cli/tests/{state-sqlite,telemetry-command,local-state-indexes,mutation-safety}.test.ts`.
- Red proofs first: version upgrade/downgrade, event multi-writer/corruption, prepared-record recovery, and backup/radar projection fixtures. Run `bun test cli/tests/state-sqlite.test.ts cli/tests/telemetry-command.test.ts cli/tests/local-state-indexes.test.ts cli/tests/mutation-safety.test.ts`.
- Outcome and acceptance: a version ledger, reversible migration path, durable writer contract, and recovery classifications exist for every supported prior schema.
- Gates: impact all persistence symbols; focused command; `bun run typecheck`; `git diff --check`; mutation method approved by the final critic.
- Commit/push/rollback: migration, event, and journal changes are separate reviewed commits pushed to `origin dev`; rollback follows the approved schema downgrade/recovery runbook, then `git revert` only when data policy permits.
- STOP: no code before F-25 roadmap/spec approval, migration retention policy, downgrade policy, and recovery matrix.

### S-F26 Windows/WSL command contract

- Primary ID: CF-P1-09. Owner: cross-platform executor; reviewer: Windows/WSL critic.
- Write scope: `cli/commands/workbench/verify.ts`, `cli/tests/{workbench-verify,operator-journeys}.test.ts`, and only approved Windows runner configuration.
- Red proof first: Windows-path argv fixture for `splitCommandLine`; run the focused Bun tests on Linux and the approved Windows runner.
- Outcome and acceptance: non-shell command parsing preserves backslashes and the supported host boundary is explicit.
- Gates: impact `Function:cli/commands/workbench/verify.ts:splitCommandLine`; focused commands on both defined runners; `git diff --check`.
- Commit/push/rollback: `fix(f26): preserve Windows command arguments`, critic GO, push `origin dev`; revert if either runner fails.
- STOP: no Windows claim and no implementation until governance defines the runner and F-26 is created.

### S-F27 Adapter control-plane transaction integrity

- Primary ID: CF-P1-17. Owner: adapter executor; reviewer: control-plane critic.
- Write scope: `cli/commands/adapter.ts`, `cli/services/adapter/claude.ts`, `.afol/config.json` schema/fixtures only if approved, `cli/tests/{adapter-command,operation-context}.test.ts`.
- Red proofs first: unauthorized toggle, malformed config, concurrent enable/disable, and injected write failure. Run `bun test cli/tests/adapter-command.test.ts cli/tests/operation-context.test.ts`.
- Outcome and acceptance: C01 blocks unauthorized calls; F-27 adds locked CAS/atomic config writes, owned-file rollback, and typed corruption errors.
- Gates: impact `Function:cli/commands/adapter.ts:runAdapterCommand`; focused command; `bun run typecheck`; `git diff --check`; security critic checks control-plane paths.
- Commit/push/rollback: `fix(f27): transact adapter control-plane writes`, critic GO, push `origin dev`; revert the adapter commit and rerun fixtures.
- Dependency: C01 must be accepted; create F-27 after critic GO.

### S-F28 Memory and library integrity

- Primary IDs: CF-P1-18, CF-P1-19. Owner: knowledge-store executor; reviewer: corruption/concurrency critic.
- Write scope: `cli/services/memory/crud.ts`, `cli/services/library/{crud,graph}.ts`, `cli/tests/{memory-crud,memory-command,library-system}.test.ts`.
- Red proofs first: malformed file preservation and two-writer barriers for memory and topics. Run `bun test cli/tests/memory-crud.test.ts cli/tests/memory-command.test.ts cli/tests/library-system.test.ts`.
- Outcome and acceptance: readers surface corruption, writers use an approved lock/CAS contract, and no concurrent update loses valid content.
- Gates: GitNexus impact for every edited exported CRUD symbol; focused command; `bun run typecheck`; `git diff --check`.
- Commit/push/rollback: separate memory and library commits, each critic-reviewed and pushed to `origin dev`; revert the affected store commit and rerun its fixture.
- Dependency: create F-28 after critic GO. Do not fold it into F-22 C06.

## Mutation, Benchmark, and Security Gates

- C08 mutation policy decision: before any mutation execution, the F-22 governing parent-spec owner must accept a governance artifact that names the method, threshold, exception policy, decision owner, and evidence artifact. The critic may review evidence but cannot approve a temporary method or threshold. No runner is currently configured in `package.json`; do not install one in a remediation slice.
- Mutation execution: after that decision, run the focused baseline twice, then use M-01 through M-07 against R-01/R-02/R-03/R-04/R-06/R-07/R-08. Every survivor is killed by observable behavior or documented under the accepted exception policy. STOP if the accepted method, threshold, compatible runner, or reproducible baseline is absent.
- Benchmarks: approve bounded scenarios `f22-authority-denial`, `f22-governance-lifecycle-race`, `f22-state-materialization`, `f22-index-publication`, and `f22-host-boundary`. Validate catalog/scenarios with `bun run kernel -- pb validate --strict --json` and `bun run kernel -- pb generate --check --json`; run the existing governance pack with `bun run kernel -- v bench --pack governance-history --json`. A new F-22 pack is created only after critic GO and compares compatible baselines.
- Security per affected slice: C01 and F27 require authorization/path/redaction tests plus the focused command. Release requires `bun run security:deps:release` and `bun run security:secrets:release`; record only redacted scanner evidence. The CI workflow remains the pinned OSV/Gitleaks execution surface.

## C08 Release, Dogfood, and Closure

- Owner-authorized amendment, 2026-07-12: the user's explicit core-readiness directive authorizes evidence-only closure validation for already-implemented C02A, C02B/C03, C03B, C03W, C04A, C05, C07A, and C07B. It authorizes no new production scope. C04A is bounded to SQLite State DB v1; State DB v2 remains F-25. C05 is bounded to one Linux/WSL host per worktree, with no cross-host or takeover claim.
- C08 requires the accepted mutation-policy decision and its immutable evidence artifact. Windows-native F-26 and F-23 through F-28 are accepted exclusions and separately governed future features, not F-22 closure prerequisites. F-22 makes no Windows-native support claim.
- After every approved slice is reviewed, committed, and pushed, a single integration owner uses the external AFOL command for lifecycle/validation: `afol local-state rebuild --json` and `afol validate project --json`. Repository source behavior uses repo-local commands: `bun run manifest:check`, `bun run typecheck`, `bun test`, `bun run validate:release`, and `bun run smoke:clean`.
- Re-run `gitnexus status` and `gitnexus detect-changes -r afol-dev --scope compare --base-ref main`; confirm graph findings in source.
- Dogfood in separate Linux-side worktrees with the one-host rule. A clean global-install smoke is external system mutation and needs explicit user authorization; it must validate a real `$HOME/.local/bin/afol`, never a repo wrapper.
- The final large read-only reviewer receives the cumulative diff, all slice reviews, red/green proof, the accepted mutation-policy decision and immutable evidence artifact, the accepted exclusions, mutation triage, benchmark compatibility record, security reports, CI result, clean-smoke result, and every scope decision. Only that reviewer's recorded PASS may authorize T-05/F-22 closure.

## Explicit Stop Conditions

- No accepted STOP-C01-AUTHORITY artifact after C01-R red proofs.
- No accepted C08 mutation-policy decision/immutable evidence artifact or final reviewer PASS.
- Any duplicate or unmapped primary canonical ID.
- A child spec or future feature is absent, unapproved, or contradicts its parent scope.
- A focused test, security scan, benchmark baseline, or independent review fails or is stale.
- A C03 change reopens F-18 command-error delivery without a new governing feature.
- An implementation attempts State DB v2 without F-25 migration/downgrade/recovery policy, claims Windows-native support without an F-26 runner, or expands C05 beyond one Linux/WSL host per worktree without separately approved governance.
- Any attempt to close on historic evidence rather than evidence for the current commit.

## Completion Matrix

| Canonical ID | Primary slice | Test-first oracle |
| --- | --- | --- |
| CF-P0-01 | S-C02A | R-05, R-10 |
| CF-P0-02 | S-C02B/C03 | R-01 |
| CF-P0-03 | S-C01 | R-02, SEC-003 in C01-R |
| CF-P0-04 | S-C04A | R-03 |
| CF-P0-05 | S-C01 | SEC-001 in C01-R |
| CF-P0-06 | S-C01 | SEC-002 in C01-I only |
| CF-P0-07 | S-C01 | SEC-004 in C01-R |
| CF-P1-01 | S-C02A | R-04 |
| CF-P1-02 | S-F23 | R-06, R-09 |
| CF-P1-03 | S-F23 | R-07 |
| CF-P1-04 | S-C07A | R-08 |
| CF-P1-05 | S-F24 | lifecycle documentation comparison |
| CF-P1-06 | S-F25 | version migration fixture |
| CF-P1-07 | S-C07B | measured index race fixture |
| CF-P1-08 | S-F25 | event writer/corruption fixture |
| CF-P1-09 | S-F26 | Windows argv fixture |
| CF-P1-10 | S-C03B | touched-path rollback fixture |
| CF-P1-11 | S-C03W | reader/writer publication barrier |
| CF-P1-12 | S-C02B/C03 | governance/start barrier |
| CF-P1-13 | S-C02B/C03 | execution-attempt barrier |
| CF-P1-14 | S-F25 | prepared recovery fixture |
| CF-P1-15 | S-F25 | backup/radar projection fixture |
| CF-P1-16 | S-C05 | actor/session fixture |
| CF-P1-17 | S-F27 | adapter CAS/rollback fixture |
| CF-P1-18 | S-F28 | memory corruption/two-writer fixture |
| CF-P1-19 | S-F28 | library corruption/two-writer fixture |
| CF-P1-20 | S-F23 | ADR/changelog process barriers |
| CF-P1-21 | S-C05 | host/takeover fixture |
| CF-P1-22 | S-C01 | SEC-006 in C01-R |

## Plan Acceptance

- [x] T-01 evidence is represented without changing the State Board.
- [/] T-02 persists the critic report, accepted C01-R checkpoint, parent strategy, and both revised plan artifacts without mutating lifecycle state.
- [x] Independent pre-execution critic returned `REVISE`; its three required corrections are represented in this revision.
- [ ] Builders receive only accepted child-spec slices with their exact write scope.
- [ ] Final closure remains reserved for the large independent reviewer.
