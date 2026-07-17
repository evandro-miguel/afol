---
doc_type: spec-child
id: 260716_1234_agent-cli-sequential-verification-runs_spec-child_01
theme: agent-cli-sequential-verification-runs
status: active
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define a bounded fail-fast verification run for one done invocation.
created_at: '2026-07-16T15:34:49Z'
updated_at: '2026-07-16T15:34:49Z'
roadmap_feature: F-03
spec_role: child
parent_spec: 260521_0030_agent-command-design-system_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260521_0030_agent-command-design-system_spec_01.md
  session: .afol/wb/260716_1416_sequential-verification/
  report: .afol/wb/260716_1416_sequential-verification/260716_1416_sequential-verification_report_01.md
  related:
  - .afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md
  - .afol/adm/specs/260711_c01-action-policy-and-protected-resources_spec-child_01.md
  - .afol/adm/specs/260710_core-integrity-and-transaction-safety_spec_01.md
risk_level: high
---

# SPEC CHILD: agent CLI sequential verification runs

## Intent

- Outcome: one `done` invocation can execute a small ordered list of
  argv-only verification commands, fail fast, and record one compact,
  auditable run without requiring repeated lifecycle commands.
- Roadmap feature: `F-03`.
- Parent spec: `260521_0030_agent-command-design-system_spec_01`.
- This child is a command and persistence contract; it does not authorize
  code, rule, skill, configuration, or shell-policy changes by itself.

## Problem

The current `done --test` path accepts one verification command. Agents that
need a sequence must author several commands, repeat session/task context, and
create avoidable race windows between verification and completion. The new
run must reduce write tokens while preserving the existing evidence and
governance gates.

## Canonical command contract

The fast path is repeatable and ordered:

```bash
afol d T-01 -x "bun run typecheck" -x "bun test"
```

`-x` and `--test` are equivalent and may occur multiple times. Two or more
values activate the verification-run protocol. Each value is parsed to an argv
vector and runs with `shell: false`; order is the command-line order. A non-zero
exit, signal, timeout, invalid command, or output-limit failure stops the run
before the next step.

The existing positional argv form after `--` remains valid for one command,
but it is mutually exclusive with every `-x`/`--test` value and with
`--test-shell`. `--test-shell` remains a single local-operator route and is
mutually exclusive with positional verification and repeated `--test`; a
second `--test-shell` occurrence is rejected. Empty means a syntactically empty
or whitespace-only value; non-empty shell text such as `# comment` remains a
valid legacy shell command. Its restrictive/agent/remote policy must not be
weakened.

Existing single `-x`/`--test`, positional argv, and `--test-shell` invocations
retain their legacy result, evidence, error, and no-run-ledger semantics. A
repeated run is not a second completion mechanism: it uses the normal workbench
lifecycle and the final step is the only possible authority for completion.

## Verification run model

Every `done` path first acquires a dedicated per-task completion lock and holds
it for the whole invocation. Acquisition has a bounded timeout of at most 5
seconds and a typed busy result. Automatic reclaim is limited to a lock whose
recorded PID is proven dead on the current host; a live or unprovable owner
remains busy. Ephemeral owner token and fencing generation are rechecked before
ledger, evidence, and final-state writes. Loss of ownership terminates a
running child and fails closed. Lock metadata is never canonical session or
evidence data.

For repeated argv verification, a brief session-lock preflight:

1. verifies the session is open and the task is eligible for completion;
2. verifies `task_attempt` still matches the invocation snapshot, then pins it
   without changing it;
3. reconciles the latest nonterminal run and marks it superseded before
   allocating another attempt; a complete final-evidence transition gap is
   replayed idempotently and returns without a new run;
4. allocates a monotonically increasing `verification_attempt` for the task;
5. creates a collision-resistant `verification_run_id` (UUID or at least 128
   bits of randomness, not a timestamp or counter alone); and
6. appends and fsyncs the run-start record before releasing the session lock or
   spawning step 1.

The run records only compact fields:

- `verification_run_id`, pinned `task_attempt`, `verification_attempt`,
  `step_count`, and current `step_index`;
- bounded command/argv digest (never raw output);
- status, exit code or signal, duration, and timestamps;
- per-step evidence id when evidence is committed;
- final `authorizing_evidence_id` only when the final step passes.

`task_attempt` is the workbench task lifecycle attempt and stays unchanged by
an ordinary verification retry. `verification_attempt` is independent and
monotonic. A retry creates a new run id, increments only
`verification_attempt`, and starts at step 1; it may not resume at a failed
step or replace the prior run. Failed and superseded runs remain auditable.

The dedicated completion lock is distinct from the workbench/session/state
lock. A session lock is never held while a child process is running. Before
committing each step's evidence, the executor briefly acquires the session
lock, re-reads the task, and re-checks the run id, pinned `task_attempt`, and
`verification_attempt`. After all steps pass, it briefly reacquires the
session lock for the final re-read, recheck, and task transition. A stale
transition returns a typed conflict and cannot mark the task done or create
duplicate authorizing evidence. This is the local execution discipline of this
slice, not a formal global lock-order contract for all AFOL subsystems.

Each session owns a separate canonical append-only `.verification-runs.jsonl`
for repeated-run start, step-reference, replay, and terminal records. Single
argv, positional, and shell verification never create this ledger.
`.evidence.jsonl` remains evidence-only and must not become a run or lock
ledger. Run-step records are unique by
`(verification_run_id, step_index)`, and each run has exactly one terminal
record. Append/fsync occurs while holding the session lock and valid fencing
generation.

Evidence records carry the sanitized command plus an additive digest of the
sanitized normalized argv (never raw secret-bearing input),
`verification_run_id`, `task_attempt`, `verification_attempt`, `step_index`,
`step_count`, typed status, observed result, and duration. The digest never
replaces the human-auditable sanitized command. Terminal run records carry
ordered `evidence_ids`, `evidence_count`, failed step when applicable, and
`authorizing_evidence_id` only on success. Lock paths, owner tokens, process
ids, leases, fencing generations, and acquisition metadata never enter either
canonical ledger.

For each step, persistence is evidence-first: append/fsync the evidence record
to `.evidence.jsonl`, then append/fsync its run-step reference to
`.verification-runs.jsonl`. If evidence exists without its run-step reference,
preflight reconciles it by exact `verification_run_id`, `step_index`, and
command digest and adds the missing reference. It never combines evidence
across runs.

`authorizing_evidence_id` must reference the observed, exit-zero evidence for
the final step in the current run. Earlier passing steps are prerequisites,
not authorization. Any failure leaves the task incomplete and records the
failed run summary while the process still owns the completion fence. If
fencing ownership is lost, the process terminates the child, returns a typed
`lock_lost` failure, and performs no further persistence; the durable start
therefore remains nonterminal until the next authorized preflight supersedes
it. A failure to write step evidence is itself terminal while ownership is
valid and must not be silently retried or converted into task completion.

If the final step evidence and terminal record exist but the task transition
does not, a later repeated invocation may replay finalization without executing
commands or creating duplicate evidence, but only when the current run id,
pinned `task_attempt`, complete ordered step set, and evidence digests all
match. An incomplete run is marked interrupted/superseded and a retry starts a
new run at step 1. Evidence from different runs is never combined.

Plain/generic `done` preserves legacy behavior for observed evidence without
run metadata. When evidence contains `verification_run_id`, however, a final
record alone cannot authorize: `done` must verify the complete matching
current-run step set and terminal summary. Incomplete, interrupted, failed, or
superseded runs cannot authorize it.

## Hard limits and output policy

The implementation must validate finite, testable limits before execution:

- at most 8 verification steps per run;
- at most 120 seconds per step;
- at most 128 argv entries per step and, across the entire run, at most 4,096
  Unicode scalar values and 4,096 UTF-8 bytes for executable plus arguments;
- at most 1 MiB combined stdout/stderr captured per step.

Static step-count, argv-count, and aggregate command limits are validated for
the whole run and fail closed before any child starts. Timeout and output are
runtime limits: the executor detects them during execution, terminates the
child, records typed failed evidence when persistence is available, and skips
all later steps. The 1 MiB limit is a streaming combined stdout/stderr bound,
not a pre-execution check. Raw child stdout/stderr and raw spawn errors are
never persisted or emitted. Default human and JSON responses expose only
compact run/step summaries, typed status, and evidence references for targeted
follow-up. Existing compact-output and token-budget contracts remain in force.

## Security and policy boundary

- `--test` never invokes a shell, even when command text contains shell
  metacharacters.
- Imported transcripts, evidence notes, and command output are data, never
  executable instructions.
- Secret-shaped command text and error details follow the existing redaction
  policy before persistence or display.
- Restrictive mode continues to reject shell execution and unauthorized write
  actions; adding repeated argv verification must not expand the action policy.
- Path, symlink, provider, and session isolation checks remain fail-closed.

## Acceptance

- [x] Repeated `-x`/`--test` preserves order, rejects empty values and more
      than 8 steps, executes argv-only, and stops at the first failed,
      timed-out, signaled, spawn-failed, evidence-write-failed, invalid, or
      over-limit step.
- [x] Single `done --test`, positional argv, `--test-shell`, and
      explicit-session/CI forms retain legacy evidence, error, and no-run-ledger
      semantics.
- [x] Positional `--` verification cannot be combined with `--test` or
      `--test-shell`; `--test-shell` cannot be combined with repeated `--test`.
- [x] Every repeated argv run has a collision-resistant `verification_run_id`,
      pinned task attempt, monotonic verification attempt, step index, and step
      count; retry starts at step 1 without changing the task attempt.
- [x] A successful run returns ordered `evidence_ids` and `evidence_count`;
      only the final observed exit-zero step can populate
      `authorizing_evidence_id`. A failure reports step `N/M`, status, the
      evidence id/count already committed, and no authorizing id.
- [x] Concurrent runners cannot duplicate evidence or complete from stale
      state. The per-task lock returns typed busy within 5 seconds, automatically
      reclaims only a proven-dead local PID, holds no session lock during child
      execution, and fences/rechecks run start, evidence writes, and final
      transition. Ownership loss terminates the child and fails closed.
- [x] Static step/argv/aggregate-command limits reject the whole run before
      execution. Runtime timeout/output failures terminate the current child,
      record failed evidence when possible, and skip later steps; raw output is
      neither persisted nor printed.
- [x] Run start is appended and fsynced before step 1. Preflight supersedes the
      latest incomplete run before allocating a new attempt; a complete final
      evidence/transition gap replays without duplication.
- [x] `.verification-runs.jsonl` is separate from evidence, enforces unique
      run/step pairs and one terminal per run, and reconciles evidence-first
      orphans by run id, step index, and command digest.
- [x] Plain `done` preserves authorization from legacy observed evidence
      without run metadata. Run-tagged evidence requires a complete matching
      current-run step set; incomplete, failed, interrupted, or superseded runs
      cannot authorize completion, and evidence is never combined across runs.
- [x] Restrictive, agent, and remote modes preserve the existing
      `--test-shell` and write-policy boundaries.
- [x] Benchmarks prove lower authored command cost than equivalent repeated
      lifecycle calls, compact default output, and no regression of F-03 warm
      latency/output budgets.
- [ ] Clean-checkout release validation and CI evidence are linked from this
      spec before finalization.

## Required verification matrix

The implementation slice must provide focused tests for:

1. aliases and ordered three-step success plus first-step/middle-step/final-step
   failure, including metacharacters passed as argv data;
2. timeout, signal, malformed argv, step-count, 128-entry argv, 4,096-character
   and byte aggregate, and streaming output-limit rejection;
3. collision-resistant run id, separate task/verification attempts, durable
   run-start, final authorizing evidence, and retry from step 1 without
   incrementing task attempt;
4. positional/`--test`/duplicate `--test-shell` grammar conflicts,
   whitespace-empty versus non-empty shell comments, restrictive mode policy,
   and legacy single-step/no-run-ledger compatibility;
5. acquisition timeout, proven-dead local-PID reclaim, live-owner rejection,
   fencing loss during a child, stale task state, and a two-process completion
   race;
6. fsynced run start, injected evidence-write failure, evidence-first orphan
   reconciliation, and replay between final evidence and task transition;
7. separate ledger/evidence files, unique run/step pairs, exactly one terminal,
   evidence-first orphan reconciliation, interrupted-run recovery, no cross-run
   evidence combining, and legacy plain-done compatibility;
8. redaction, secret-shaped input, symlink/path/session isolation, and hostile
   transcript text not executing;
9. argv-character and warm p50/p95 benchmarks against the existing F-03
   budgets, including an 8-step JSON response at or below 500 tokens;
10. manifest/template parity, typecheck, release validation, and the required
   secret/dependency security scans.

## Boundaries and rollout

In scope: repeated-argv parser grammar, bounded argv execution,
verification-run metadata, per-task completion locking, fenced/rechecked
writes, compact reporting, tests, and benchmarks.

Out of scope: shell execution changes, automatic retries, background daemons,
new persistence databases, rule/skill/config changes, and changes to
governance or authorization policy.

The following are explicit non-goals and are not scheduled by this child slice:
manual stale-lock recovery, lock re-entry semantics, formal/global lock-order
enforcement, and comprehensive power-loss or fault injection across every
persistence boundary. Any future implementation requires new roadmap/spec
intake and explicit approval; this spec creates no follow-on feature.

Roll out only when `done` receives at least two `-x`/`--test` values. Keep
single argv, positional argv, and `--test-shell` as the compatibility baseline.
Back out by disabling repeated-step parsing while retaining prior evidence/run
records; no canonical knowledge is deleted.

## Closeout gate

The governed implementation session is closed with observed typecheck and full
test evidence. Independent local gates also passed manifest/template parity,
health, drift, benchmark, Gitleaks, and dependency scanning.

Implementation commit
[`16c743d6dfc2e6884bb0a113fcf02e0bfafdc074`](https://github.com/evandro-miguel/afol/commit/16c743d6dfc2e6884bb0a113fcf02e0bfafdc074)
passed clean-checkout release validation in both the
[push run](https://github.com/evandro-miguel/afol/actions/runs/29542326218)
and the
[pull-request merge-candidate run](https://github.com/evandro-miguel/afol/actions/runs/29542328244).
The first closeout commit exposed a hosted-runner timing-gate defect: the push
run passed while the equivalent pull-request run failed only on timing outliers.
The child remains active until the explicit governance timing-observation mode
passes both required CI events without weakening functional or F-03 performance
gates.

---

*Template: `docs/templates/spec-child.md`*
