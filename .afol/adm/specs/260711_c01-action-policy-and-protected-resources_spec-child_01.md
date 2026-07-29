---
doc_type: spec-child
id: 260711_c01-action-policy-and-protected-resources_spec-child_01
theme: c01-action-policy-and-protected-resources
status: active
owners:
- f22-governance-owner
- c01-implementation-writer
- c01-implementation-reviewer
workstream_intent: Enforce the accepted local-operator and restrictive-mode policy at one pre-dispatch boundary and protect sensitive and AFOL-owned resources before I/O.
artifact_purpose: Define the separately reviewable S-C01-I production scope after STOP-C01-AUTHORITY.
created_at: '2026-07-11T00:00:00Z'
updated_at: '2026-07-11T00:00:00Z'
roadmap_feature: F-22
spec_role: child
parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: .afol/wb/260710_2355_core-integrity-quality-loop/260710_2355_core-integrity-quality-loop_plan_01.md
  task: T-03
  report: .afol/wb/260710_2355_core-integrity-quality-loop/reports/c01-authority-critic-005.json
risk_level: high
acceptance_status: accepted_implementation_scope
accepted_by: f22-governance-owner
accepted_at: '2026-07-11T08:47:38Z'
---

# SPEC CHILD: C01 Action Policy and Protected Resources

## Objective

- Outcome: explicit restrictive-mode invocations cannot reach local-operator-only actions or inspect protected content, while direct local-operator behavior remains compatible.
- Roadmap feature: `F-22`.
- Parent spec: `260710_core-integrity-and-transaction-safety_spec_01`.

## Preconditions

- The F-22 governance owner must accept the Authority Decision in `260711_c01-authorization-red-reproducers_spec-child_01`.
- An independent critic must return `GO` for this exact implementation scope.
- Both conditions are recorded. This active child spec grants one C01-I writer the exact production and test boundaries below.

## Canonical Position

- Direct invocation is the local-operator deployment path. It is not authenticated identity.
- Explicit agent and remote contexts are restrictive policy modes only.
- Command/action metadata is the canonical admission policy. Handler-local checks remain defense in depth.
- Same-account process isolation and a launcher-issued multi-principal model are outside C01.
- TTY/PTY context is a policy signal only and is not caller authentication.

## Scope

In scope:

- Resolve one canonical action policy before a handler performs I/O.
- Correct incomplete or misleading command/action side-effect metadata required by C01.
- Pass an immutable execution-mode context through admitted C01 paths.
- Deny local-operator-only actions for explicit agent and remote contexts.
- Deny restrictive-mode reads of sensitive paths and AFOL control-plane paths before target reads, previews, backups, or journal writes.
- Redact or reject credential-shaped command text before evidence and event persistence without exposing `done --test-shell` to restrictive modes.
- Preserve structured JSON error envelopes and exit code `2` for policy denials.

Allowed production files:

- `cli/core/operation-context.ts`
- `cli/main.ts`
- `cli/registry.ts`
- `cli/router.ts`
- `cli/commands/file.ts`
- `cli/commands/file/shared.ts`
- `cli/services/workbench/lifecycle.ts`

Allowed tests:

- `cli/tests/kernel.test.ts`
- `cli/tests/operation-context.test.ts`
- `cli/tests/registry.test.ts`
- `cli/tests/router.test.ts`
- `cli/tests/file-command-unit.test.ts`
- `cli/tests/mutation-safety.test.ts`

Out of scope:

- A daemon, broker, launcher binary, key store, bearer token, host-account change, container policy, or downstream wrapper.
- Authentication claims for direct invocation, omitted markers, task owners,
  same-account PTY-capable actor abuse, or session actors.
- Cross-host ownership, revocation, or replay systems.
- Adapter handler changes or transactionality, bootstrap transactionality, journal recovery, broad event auditing, or unrelated registry cleanup.
- `src/project-template/**`, generated payloads, manifests, provider configuration, legacy runtime surfaces, deploy, install, or release work.
- Agent-facing or remote `done --test-shell` access.

## Required Behavior

1. Router resolution yields a canonical command plus action metadata that distinguishes reads, previews, generated writes, and real writes.
2. The pre-dispatch policy denies explicit restrictive contexts for local-operator-only actions before handler I/O.
3. Handler-local checks remain in place where they protect deeper boundaries.
4. Sensitive-path and AFOL-control-plane classification occurs before file content is read.
5. `recordEvidence` sanitizes command text once before constructing either the evidence record or its workbench event. Both records receive the same sanitized string.
6. Direct invocation retains documented local-operator behavior. Tests label this as deployment policy, not identity proof.
7. Existing restrictive context cannot become local through another flag, environment value, owner, or actor label within the same invocation.
8. C01 creates no persistent policy-decision audit. A denial returns `ok: false`, `exit_code: 2`, the normalized action, and `error.code: approval-required` before handler I/O. The denial path leaves project files unchanged.
9. Same-account PTY-capable shell-like actors do not acquire
   local-operator rights from transport cues; explicit allowed context is still
   required for local action.

## Closed Action-Policy Matrix

Normalization rules:

- Normalize the top-level command through the existing router aliases.
- Normalize the first command action through its existing parser aliases.
- `--dry-run` selects the preview action wherever the table has preview/apply rows. Flag position does not change the selected action.
- `hydrate` has no action token and normalizes to `hydrate.run`.
- `done --test-shell` takes precedence over other `done` variants and normalizes to `workbench.done.test-shell`.
- Commands and actions not listed below retain their existing handler policy. C01 does not turn registry display metadata into a repo-wide behavior change.

| Canonical action ID | Normalized invocation | Side effect | Allowed execution modes |
|---|---|---|---|
| `adr.new` | `adr new|create ...` | write | local operator only |
| `adr.accept` | `adr accept|ac ...` | write | local operator only |
| `adr.supersede` | `adr supersede|sp ...` | write | local operator only |
| `adr.abandon` | `adr abandon|ab ...` | write | local operator only |
| `adr.archive` | `adr archive|ar ...` | write | local operator only |
| `adm.migrate.preview` | `adm migrate ... --dry-run` | read preview | local, agent, remote |
| `adm.migrate.apply` | `adm migrate ...` | write | local operator only |
| `spec.waive` | `spec waive ...` | write | local operator only |
| `changelog.add` | `changelog add ...` | write | local operator only |
| `state.sync` | `state sync ...` | generated write | local operator only |
| `hydrate.run` | `hydrate ...` | generated write | local operator only |
| `adapter.enable.preview` | `adapter enable ... --dry-run` | read preview | local, agent, remote |
| `adapter.enable.apply` | `adapter enable ...` | write | local operator only |
| `adapter.disable.preview` | `adapter disable ... --dry-run` | read preview | local, agent, remote |
| `adapter.disable.apply` | `adapter disable ...` | write | local operator only |
| `file.patch.preview` | `file append|patch|pt ... --dry-run` | content preview | all modes for ordinary targets; denied for protected targets in all modes |
| `file.patch.apply` | `file append|patch|pt ...` | write | local operator only and ordinary targets only |
| `file.move.preview` | `file mv|move ... --dry-run` | metadata preview | all modes for ordinary source and destination; denied if either operand is protected |
| `file.move.apply` | `file mv|move ...` | write | local operator only and ordinary operands only |
| `file.archive.preview` | `file ar|archive ... --dry-run` | metadata preview | all modes for ordinary targets; denied for protected targets |
| `file.archive.apply` | `file ar|archive ...` | write | local operator only and ordinary targets only |
| `file.undo.preview` | `file ud|undo ... --dry-run` | journal-derived preview | local operator only |
| `file.undo.apply` | `file ud|undo ...` | journal-derived write | local operator only |
| `workbench.evidence.record` | `evidence ...` | write | local operator only; command text uses the sanitization contract |
| `workbench.done.record` | `done ...` without test flags | write | local operator only |
| `workbench.done.verify` | `done ... --test ...` | process execution and write | local operator only |
| `workbench.done.test-shell` | `done ... --test-shell ...` | shell execution and write | local operator only; never exposed through agent or remote catalogs |

Denial contract:

- JSON mode returns schema `afol.result/v1`, `ok: false`, `exit_code: 2`, `action` equal to the canonical action ID, and `error.code: approval-required`.
- Human mode writes `err approval-required <message>` to stderr and exits `2`.
- Policy denial occurs before the handler performs target, journal, backup, adapter, state, or governance I/O.

## Protected-Resource Classifier

Path normalization and precedence:

1. Resolve and jail the operand under the canonical project root with existing traversal and symlink checks.
2. Convert the project-relative path to slash-separated segments without case folding the full path.
3. Apply the control-plane class, then the sensitive-file class, before any target-content read, preview, backup, or mutation-journal write.
4. A protected classification overrides local-operator admission for generic `file` patch, move, and archive actions. Command-specific internal services remain the supported path for AFOL-owned state.

Control-plane class:

- Any path equal to or below `.afol/adm`, `.afol/wb`, `.afol/state`, or `.afol/data/mutations`.
- Exact paths `.afol/config.json`, `.agents/config.json`, `.agents/lock.json`, and `.agents/manifest.json`.

Sensitive-file class:

- Any basename equal to `.env` or starting with `.env.`.
- Basenames `.npmrc`, `.pypirc`, `.netrc`, `id_rsa`, `id_dsa`, `id_ecdsa`, or `id_ed25519`.
- Extensions `.pem`, `.key`, `.p12`, or `.pfx`, compared case-insensitively.

Operand rules:

- Patch: classify the target before its content is read. Protected targets are denied in preview and apply for every mode.
- Move: classify source and destination before reading source metadata or creating a destination. Either protected operand denies preview and apply for every mode.
- Archive: classify the target before metadata or content access. Protected targets are denied in preview and apply for every mode.
- Undo: explicit agent and remote modes are denied before journal reads. Local-operator undo retains the existing journal and backup validation behavior; C01 adds no new journal-derived path rule and makes no claim about legacy protected-target records.
- Ordinary-path direct local patch, move, archive, and undo behavior remains unchanged.
- Generic file probe defaults move from `.afol/data/mutations/**` to `.afol/tmp/file-command/**`. This preserves the existing direct local default preview behavior while keeping the mutation journal tree protected. The move is limited to the three existing default probe paths and their focused assertions.

## Command-Text Sanitization Contract

- Scope: `recordEvidence` command text only. This rule does not parse or enable `done --test-shell`.
- Classifier names: `TOKEN`, `PASSWORD`, `PASSWD`, `SECRET`, `API_KEY`, `ACCESS_KEY`, and `PRIVATE_KEY`.
- Assignment-key normalization: uppercase the key for comparison. Match when the normalized key equals a classifier name or ends with `_<classifier-name>`. Therefore `API_KEY` and `DEMO_API_KEY` match, while `API_KEY_NOTE` does not.
- Long-option normalization: strip the leading `--`, uppercase, and replace `-` with `_`. Long options match an exact classifier name only. Therefore `--api-key` matches and `--demo-api-key` does not.
- Assignment forms: `NAME=value` and `--name=value`.
- Separate option form: `--name value`.
- Outcome: redact the matched value. Do not reject the evidence operation.
- Canonical representation: preserve the original key or option spelling and replace only its value with `[REDACTED]`. Examples: `DEMO_API_KEY=[REDACTED]` and `--token [REDACTED]`.
- Persistence invariant: the raw matched value appears in neither `.evidence.jsonl` nor the corresponding workbench event. The same canonical redacted command string appears in both.
- Boundary: unmatched free-form values are not claimed to be automatically classified. Callers must still avoid placing sensitive values in command text.
- Test fixtures: cover `DEMO_API_KEY=value`, `--api-key value`, and `--token=value` with synthetic values that are not credentials. Assert each raw fixture is absent and the same canonical `[REDACTED]` command is present in both persisted records. Include one non-match such as `API_KEY_NOTE=value` to bound the classifier.

## Verification and Acceptance

- GitNexus impact for each edited symbol is checked and confirmed in source. Any `HIGH` or `CRITICAL` risk blocks implementation until reported.
- Current C01 red proofs `R-02`, `SEC-001`, `SEC-003`, and `SEC-004` turn green for the intended policy reason.
- A focused `SEC-006` assertion records synthetic assignment and long-option forms through the evidence path, then verifies the canonical redacted command is identical in evidence and its workbench event without invoking the test shell.
- Focused denial assertions verify the structured `approval-required` envelope and unchanged project bytes. They do not expect a persistent denial log.
- Tests do not claim that omitted markers prove agent absence or that self-issued values authenticate a caller.
- The focused six-file suite passes.
- `bun run typecheck`, `bun run manifest:check`, and `git diff --check` pass.
- One independent implementation reviewer returns `PASS` before commit or push.
- The implementation remains one bounded commit with a documented `git revert <commit>` rollback.

## Rollout and Backout

- Rollout: enable the central policy and protected-resource behavior in the source CLI after the accepted authority decision, accepted scope, green focused suite, and independent review.
- Deployment prerequisite: agent and remote tool catalogs expose only
  constrained AFOL entries and no unrestricted AFOL or generic shell route,
  including unmarked mutate commands such as `apply`, `rollback`, and `raw`.
- Backout: revert the single C01 implementation commit and keep the deployment catalog restriction in place. The rollback oracle is restoration of the accepted S-C01-R evidence: the 7 kernel and 5 mutation assertions for `R-02`, `SEC-001`, `SEC-003`, and `SEC-004` fail for the documented status-0-versus-2 reason, while the previously recorded nearest baseline groups remain green. Do not report the complete six-file suite as green after implementation-only rollback. Do not replace the decision with a self-issued token or wrapper.

## Acceptance

- [x] Authority decision is accepted by the F-22 governance owner.
- [x] Independent critic returns `GO` for this scope.
- [x] Exact production and test boundaries are accepted.
- [ ] Current red proofs become green for the intended reason.
- [ ] Claim limits and deployment prerequisite remain explicit.
