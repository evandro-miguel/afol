---
doc_type: spec
id: 260710_core-integrity-and-transaction-safety_spec_01
theme: core-integrity-and-transaction-safety
status: active
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define fail-closed lifecycle, mutation, update, bootstrap, governance, and state-integrity behavior for concurrent AFOL execution.
created_at: '2026-07-10T00:00:00-04:00'
updated_at: '2026-07-10T00:00:00-04:00'
roadmap_feature: F-22
spec_role: parent
parent_spec: ''
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - cli/commands
  - cli/services/workbench
  - cli/services/mutations
  - cli/services/update
  - cli/services/bootstrap
  - cli/services/governance
  - cli/services/state
  - cli/tests
  packages:
  - afol-cli
risk_level: high
---

# SPEC: Core Integrity and Transaction Safety

## 1) Feature Intent

- Outcome: AFOL agents can complete tasks and mutate shared project state only
  through validated state transitions, authorized evidence, current hashes, and
  recoverable commits.
- Why now: static review found paths that can produce false completion, lost
  updates, destructive undo, stale scaffold updates, partial bootstrap, and
  governance bindings that do not resolve to real project authority.
- Roadmap feature: `F-22`
- Role of this spec: parent feature spec for core integrity hardening.

## 2) Problem

- Declared text can currently authorize task completion without observed command
  execution, and task state changes do not consistently enforce legal prior
  states.
- Session-scoped locks do not protect files or scaffold resources shared across
  sessions. Atomic writes alone do not prevent stale read-modify-write loss.
- File mutation, undo, journal, update, bootstrap, governance, and session
  context can diverge when a later durable step fails.
- Undo can destroy pre-existing or newer content when backups are missing or the
  target changed after the original mutation.
- Governance can accept free-form identifiers and can penalize unrelated future
  work instead of blocking the affected ungoverned session.
- Corrupt durable inputs can be skipped or rewritten silently, making incomplete
  derived state appear fresh or closed.

## 3) Users and User Journey

Primary users:

- Operators running multiple local or remote AFOL agents against one project.
- Agents using lifecycle, file, update, bootstrap, governance, and state commands.

User journey:

1. The operator creates or selects a governed workstream and starts a task.
2. AFOL accepts only a legal state transition and records the current authority.
3. The agent executes validation or supplies an allowed typed artifact or waiver.
4. AFOL identifies the exact evidence or policy that authorizes completion.
5. Mutations acquire locks for the canonical shared resources, verify current
   hashes, and commit file state with an auditable journal outcome.
6. A later undo or rollback proceeds only when current state still matches the
   recorded postcondition.
7. Partial failure returns structured recovery information without hiding a
   durable commit or destroying newer work.

Failure or friction points:

- Illegal transition -> reject with current state and allowed next states.
- Missing completion authority -> keep task open and report required evidence.
- Resource drift -> return conflict and require a new preview or plan.
- Missing backup, duplicate undo, or corrupt journal -> block recovery without
  deleting or overwriting the target.
- Invalid governance binding -> reject before task execution.
- Auxiliary failure after a durable commit -> return committed-with-warnings or
  roll back; never report an ambiguous generic failure.

## 4) Experience and Behavior

- Expected behavior:
  - All task-state changes pass through one explicit transition policy.
  - Executable completion requires observed evidence with `exit_code=0`.
  - A later observed success may authorize completion after an earlier observed
    failure when it is applicable to the current task state and policy.
  - Declared evidence authorizes completion only through a typed artifact policy
    or typed waiver with a verifiable reference and reason.
  - `n/a` is valid only for a task type whose completion policy explicitly
    permits non-execution.
  - Completion output identifies the authorizing evidence or typed policy.
  - Locks cover canonical resources, not caller session identity. Multi-resource
    locks use deterministic ordering.
  - Hash preconditions are checked inside the lock immediately before commit.
  - Recovery checks the recorded post-mutation hash before changing current
    content.
  - Readers report corruption and reserve destructive repair for an explicit
    repair command.
- Boundaries:
  - Git remains the repository-level history system; AFOL recovery does not
    replace Git.
  - The feature does not add a database transaction engine or distributed lock
    service.
  - Historical records are not silently rewritten to satisfy the new policy.
  - No legacy `.agents` runtime or downstream project-local executable returns.

## 5) Scope

In scope:

- Formal lifecycle state transitions and completion authorization.
- Typed observed, artifact, waiver, and non-executable completion policies.
- Resource locks, deterministic multi-lock ordering, and hash compare-and-swap.
- Mutation journal integrity, rollback on commit failure, and safe undo rules.
- Collision-resistant mutation, event, telemetry, and related durable IDs.
- Global scaffold-update lock, in-lock replan, ownership-aware removal,
  informative preserve skips, and guarded rollback by `batchId`.
- Bootstrap/init operation context, target lock, staging, validation, commit,
  rollback, and one structured error boundary.
- Real feature/spec resolution, canonical binding metadata, governance locking,
  and transactional pending-spec resolution.
- Quick-task explicit command and governance or waiver requirements.
- Session-context locking, transactional switch, strict hydration, duplicate
  task detection, canonical status priority, and corrupt-session classification.
- Consistent JSON error envelopes and mutation runtime provenance checks.

Out of scope:

- General distributed transactions across machines.
- Automatic repair of corrupt journals or governance indexes during reads.
- Broad redesign of roadmap/spec formats.
- Reopening final F-04, F-08, F-09, F-18, or F-20 delivery records.
- Unrelated CLI, documentation, dependency, or formatting cleanup.

## 6) Child Spec Strategy

- Child specs required: conditional.
- Decomposition rule:
  - Use child specs when separate agents own lifecycle, mutation/update,
    bootstrap/governance, or state-integrity slices with independent rollback
    paths.
  - Keep a bounded slice in this parent spec plus its workbench plan when one
    owner can deliver and review it coherently.
- Planned child specs:
  - None required before the first lifecycle and completion-authorization slice.
  - Create later child specs only when the execution plan assigns independently
    reviewable mutation/update or bootstrap/governance boundaries.

## 7) Constraints and Assumptions

- Assumptions:
  - Canonical repository paths can identify local shared resources.
  - Existing observed evidence retains enough provenance and exit-code data for
    strict completion decisions after migration.
  - An observed successful rerun should supersede an earlier failure for the
    same applicable validation purpose without deleting either record.
- Constraints:
  - Compatibility: existing valid commands and compact output remain stable
    unless safety requires an explicit error or new required input.
  - Operational: all routine output stays below AFOL token budgets; concurrency
    tests use separate processes and bounded fixtures.
  - Security/privacy: approval, path jail, symlink safety, secret redaction, and
    runtime provenance remain fail-closed for real writes.
  - Recovery: no undo or rollback may overwrite content that no longer matches
    the recorded postcondition.

## 8) Acceptance

- Success looks like:
  - The canonical transition table rejects `done -> in_progress`,
    `moved -> in_progress`, and direct completion from pending or problem state.
  - Completion rejects declared-only success, missing exit code, generic `n/a`,
    and stale inapplicable evidence.
  - Completion accepts the latest applicable observed `exit_code=0` evidence
    even when an earlier applicable attempt failed, and reports its ID.
  - Typed artifact and waiver paths require explicit policy, reference, reason,
    and audit metadata.
  - Two processes mutating the same path cannot commit from the same stale base.
  - Patch, move, archive, and undo do not leave an applied unjournaled mutation;
    fault injection proves rollback or an explicit prepared/recoverable state.
  - Undo blocks on missing required backup, post-mutation drift, prior undo, or
    corrupt journal. Latest lookup skips unsupported mutation kinds.
  - Concurrent scaffold updates serialize globally and recompute their plan
    after acquiring the lock. Project-owned or changed stale paths are preserved
    or conflicted, never recursively removed as managed content.
  - A successful update can be rolled back by batch only while current hashes
    match the recorded update outputs.
  - Bootstrap/init real writes require local approval, serialize by target, and
    leave the target unchanged after an injected pre-commit or commit failure.
  - Governance resolution rejects nonexistent, inactive, or unrelated feature
    and spec identifiers and persists canonical path/hash authority.
  - Pending governance blocks `start` for that session; it does not block an
    unrelated `new`. Quick-task requires a command and valid governance or an
    explicit typed waiver before session creation.
  - Session-context, pending-spec, journal, workbench, and evidence corruption
    are surfaced as typed integrity failures. Hydration cannot report fresh when
    canonical rows were discarded.
  - JSON callers receive one stable error envelope for all covered commands.
- Review questions:
  - Can every destructive or completion transition name its authority and
    preconditions?
  - Can an operator distinguish rejected, rolled-back, committed-with-warnings,
    and recoverable-prepared outcomes?
  - Do concurrency tests use independent processes and shared real resources?

## 9) Risks and Tradeoffs

- Risk: stricter completion exposes historical evidence gaps -> Mitigation:
  report compatibility findings explicitly and require typed migration policy
  instead of accepting declared evidence by default.
- Risk: shared locks deadlock -> Mitigation: canonicalize all resource keys and
  acquire multiple locks in deterministic order.
- Risk: transaction abstraction becomes broader than the failure modes ->
  Mitigation: share only lock ordering, hash guards, journal states, and rollback
  helpers proven by at least two concrete flows.
- Risk: rollback destroys later work -> Mitigation: require current hash to match
  the recorded postcondition before restoration.
- Tradeoff: stricter commands may add explicit flags -> Why accepted: the extra
  input makes authority and recovery behavior inspectable.

## 10) Rollout and Lifecycle

- Rollout approach:
  1. Deliver lifecycle transitions and completion authorization as the first
     independently releasable safety slice.
  2. Deliver resource locks, hash guards, journal integrity, and undo safety.
  3. Reuse the proven primitives for scaffold update and batch rollback.
  4. Add approval-gated staged bootstrap/init.
  5. Harden governance, session context, hydration, verification, JSON errors,
     and cross-process identifiers.
- Workstream linkage:
  - Every execution session must reference `roadmap_feature: F-22` and
    `parent_spec: 260710_core-integrity-and-transaction-safety_spec_01`.
- Backout or deferral:
  - Each phase must remain independently reviewable and reversible.
  - Later phases may be deferred, but no phase may weaken observed completion,
    hash preconditions, or fail-closed recovery already delivered.

## 11) Verification Philosophy

- Evidence expected from delivery:
  - Focused state-transition and evidence-policy tests, including later
    observed success after earlier failure.
  - Separate-process concurrency tests for path, scaffold, governance, and
    context locks.
  - Fault-injection tests at each durable boundary for mutation, update,
    bootstrap, and governance.
  - Corruption fixtures for journal, task/evidence hydration, pending-spec, and
    session-context readers.
  - Focused command tests, typecheck, full tests, release validation, Gitleaks
    with redaction, and OSV Scanner or the documented narrow fallback.
- Open questions:
  - Q-01 Which existing task metadata should select executable, artifact, or
    waiver completion policy without introducing a parallel task schema?
  - Q-02 Should prepared journal records be durable two-phase entries or should
    every supported local mutation use synchronous rollback on append failure?
  - Q-03 Which existing manifest field is the canonical last-managed hash for
    safe removal, and what migration is required where it is absent?

## 12) Acceptance Checklist

- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail

---

*Spec: `.afol/adm/specs/260710_core-integrity-and-transaction-safety_spec_01.md`*
