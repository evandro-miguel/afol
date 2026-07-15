---
doc_type: spec-child
id: 260711_c01-authorization-red-reproducers_spec-child_01
theme: c01-authorization-red-reproducers
status: active
owners:
- f22-governance-owner
- c01-red-test-writer
- c01-red-test-reviewer
workstream_intent: Authorize a narrowly bounded, evidence-only C01 red-test checkpoint before any authority implementation.
artifact_purpose: Define the accepted test-only boundary, review contract, and authority-decision gate for C01.
created_at: '2026-07-11T00:00:00Z'
updated_at: '2026-07-11T00:00:00Z'
roadmap_feature: F-22
spec_role: child
parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: .afol/wb/260710_2355_core-integrity-quality-loop/260710_2355_core-integrity-quality-loop_plan_01.md
  task: T-02
  report: .afol/wb/260710_2355_core-integrity-quality-loop/reports/pre-execution-critic-001.json
risk_level: high
acceptance_status: accepted_test_only_checkpoint
accepted_by: f22-governance-owner
accepted_at: '2026-07-11T00:00:00Z'
authority_decision_status: accepted
authority_decision_accepted_by: f22-governance-owner
authority_decision_accepted_at: '2026-07-11T08:47:38Z'
---

# SPEC CHILD: C01 Authorization Red Reproducers

## Objective

- Outcome: C01 obtains current-behavior evidence without granting production implementation authority.
- Roadmap feature: `F-22`.
- Parent spec: `260710_core-integrity-and-transaction-safety_spec_01`.
- This active child spec is the accepted, narrowly test-only checkpoint permitted by the pre-execution critic.

## Non-Goals

- Do not implement an issuer, launcher, capability, ActionSpec, protected-path, redaction, registry, router, file, adapter, or workbench change.
- Do not add production code, generated output, manifest changes, configuration, capability contracts, release work, or a final `SEC-002` assertion.
- Do not classify omitted markers, forged capabilities, or direct invocation as safe before the authority decision is accepted.
- Do not enable or expose `done --test-shell` to agent-facing execution paths.

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- This checkpoint governs `S-C01-R` only. The combined `S-C01` route retains the five primary finding IDs.
- `S-C01-I` remains blocked. This child spec does not authorize it.

## Child Scope Rationale

- Current caller-controlled trust cannot prove an agent or remote caller is restricted.
- The checkpoint isolates reproducible present behavior from a future capability contract that cannot be specified safely yet.

## Boundaries

- In scope: the one writer, one independent reviewer, six test files, five listed red reproducers, explicit `--agent` inputs, and non-secret fixtures.
- Out of scope: every production surface, generated payload, manifest, configuration, capability contract, release gate, and the final `SEC-002` assertion.

## Authorized Roles and Write Boundary

- `c01-red-test-writer` is one designated writer. Only this role may modify the six test files below.
- `c01-red-test-reviewer` is one independent, read-only reviewer. The reviewer must not author, amend, or co-own the writer's patch.
- Allowed files, and no others:
  - `cli/tests/kernel.test.ts`
  - `cli/tests/operation-context.test.ts`
  - `cli/tests/registry.test.ts`
  - `cli/tests/router.test.ts`
  - `cli/tests/file-command-unit.test.ts`
  - `cli/tests/mutation-safety.test.ts`
- Allowed reproducers: `R-02`, `SEC-001`, `SEC-003`, `SEC-004`, and `SEC-006`.
- Every reproducer uses an explicit `--agent` input and a non-secret fixture.
- `SEC-002` final capability-contract assertions are deferred to `S-C01-I` after the authority decision.

## User or Operator Journey

1. The governance owner assigns the one red-test writer under this active checkpoint.
2. The writer records only the five authorized present-behavior reproducers in the six allowed test files.
3. The independent reviewer verifies path scope, fixture safety, the red result, and the absence of production or capability-contract assertions.
4. The work stops at `STOP-C01-AUTHORITY` until the governing authority decision is accepted.
5. A later executor receives `S-C01-I` authority only after that decision and a separately accepted implementation scope.

## Architecture Impact

- This checkpoint has no production architecture impact because it changes no production surface.
- The future decision must define the non-forgeable boundary before any production architecture is selected.

## Authority Decision Gate

- Gate: `STOP-C01-AUTHORITY`.
- Decision owner: the F-22 governing parent-spec owner. A critic may review the decision but cannot issue it.
- Decision artifact: an accepted revision of this child spec's Authority Decision section or a linked accepted F-22 ADR. This initial accepted checkpoint is not that decision.
- Required fields:
  - issuer and trust boundary;
  - audience;
  - expiry and renewal;
  - revocation;
  - replay protection;
  - verification;
  - audit;
  - local-operator fallback;
  - test-shell policy.
- No production, capability-contract, or `SEC-002` final assertion may start until the artifact contains all fields and is accepted by the decision owner.

## Accepted Authority Decision

Status: accepted by the F-22 governance owner after the independent `GO` in `reports/c01-authority-critic-005.json`. Production work is authorized only through the separately accepted `S-C01-I` child spec.

- Issuer and trust boundary: AFOL introduces no CLI-issued credential. Direct invocation is the deployment's local-operator authority path. AFOL does not authenticate that path in-process. A process with ordinary write access under the same Unix account is outside the CLI isolation boundary.
- Audience: direct AFOL invocation serves the local operator. Explicit agent and remote invocations are restrictive policy modes only. They are not authenticated principals.
- Expiry and renewal: policy mode is resolved for one process invocation and ends with that process. No durable grant or renewal protocol exists.
- Revocation: deployment removes the constrained tool entry, generic shell access, or project write access. AFOL has no in-process revocation mechanism for a same-account direct invocation.
- Replay protection: not applicable because C01 introduces no bearer artifact. Locks, task IDs, owners, actors, flags, and environment values are not replay protection.
- Verification: AFOL resolves one canonical action policy from normalized command/action metadata before dispatch and applies it to an immutable execution-mode context. Explicit restrictive inputs may reduce access only. No CLI input proves local-operator identity.
- Audit: C01 creates no persistent allow-or-deny decision log. A denied action returns the existing structured result envelope with `ok: false`, `exit_code: 2`, the normalized action, and `error.code: approval-required`; that response is the observable decision record. Denial must occur before handler I/O, so the denial itself does not mutate project state. Allowed actions retain their existing command-specific evidence behavior. Deployment catalog review remains separate deployment evidence.
- Local-operator fallback: direct invocation is the local-operator path, not an agent fallback. A process already classified as restricted cannot upgrade itself through another flag, environment value, task owner, or session actor.
- Test-shell policy: `done --test-shell` remains local-operator-only. Agent and remote tool catalogs must not expose it or a generic shell that permits unrestricted AFOL invocation. Command persistence requires separate bounded redaction before it is considered safe.

Classification limits:

- Direct invocation is a local-operator deployment boundary. It is not proof of a human operator or same-account isolation.
- Omitted markers select the direct local-operator path. They do not prove that an agent is absent.
- Flags, environment values, task owners, session actors, and project-stored values are not authority credentials.
- `SEC-002` is not resolved as an identity guarantee. A real multi-principal model remains future work and requires an external launcher plus an OS, account, or container boundary that prevents direct AFOL invocation.

Decision rationale:

- The current repository has no external issuer or protected deployment boundary.
- A launcher artifact stored in argv, environment, or project-writable state would remain self-issued or replayable.
- Adding a daemon, key system, wrapper, or token without an external trust root would increase complexity without creating authority.
- The proposed boundary matches the current external-operator CLI and limits C01 claims to behavior that the repository can verify.

## Risks and Mitigations

- Risk: a red reproducer is mistaken for a fix. Mitigation: define red failures as evidence only and prohibit lifecycle closure from this checkpoint.
- Risk: test work implies a trusted caller model. Mitigation: block `S-C01-I` on the explicit authority-decision artifact.
- Risk: sensitive fixture data enters the test tree. Mitigation: require non-secret fixtures and independent review.

## Verification Plan

- AFOL lifecycle and governance validation uses the external `afol` command: `afol validate project --json`.
- Repository source behavior uses the repo-local Bun kernel/test surface only: `bun test cli/tests/kernel.test.ts cli/tests/operation-context.test.ts cli/tests/registry.test.ts cli/tests/router.test.ts cli/tests/file-command-unit.test.ts cli/tests/mutation-safety.test.ts`.
- Expected red failures are evidence of present behavior. They are not task completion, implementation acceptance, a release gate, or authorization to call `afol done`.

## Review and Acceptance

- Checkpoint acceptance: this document is active and authorizes only the writer, reviewer, files, and reproducers above.
- Red-test review: the independent reviewer must verify the exact changed paths, explicit `--agent` inputs, non-secret fixtures, authorized test IDs, and the absence of `SEC-002` final assertions or production changes.
- Red-test acceptance: a red failure may be recorded as evidence only. It cannot close C01, T-02, T-05, or F-22.
- Implementation acceptance: only a later accepted authority decision and `S-C01-I` review can authorize production implementation.

## Rollout and Backout

- Rollout: this active checkpoint permits only the scoped test writer assignment. It introduces no production behavior or release.
- Rollback: revert the isolated red-test commit with `git revert <red-test-checkpoint-commit>`, rerun the focused test command, and keep `S-C01-I` blocked. Do not revert shared history or add a production workaround.

## Acceptance

- [x] Child scope is explicit and bounded.
- [x] Parent spec linkage is explicit.
- [x] One writer and one independent reviewer are assigned.
- [x] Delivery evidence target is the pre-execution critic report.
- [x] Authority decision and rollback conditions are explicit.
