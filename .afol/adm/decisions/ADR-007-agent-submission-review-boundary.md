---
doc_type: adr
id: ADR-007
title: F-31 External Receipts and Fixed Harness Tool Profiles
status: accepted
created_at: '2026-07-18T00:00:00-03:00'
updated_at: '2026-07-31T00:00:00-03:00'
decision_type: governance
owners:
- F-31 governance owner
supersedes: ''
superseded_by: ''
affected_specs:
- .afol/adm/specs/260717_agent-submission-and-batch-review_spec_01.md
affected_rules: []
affected_skills: []
affected_commands: []
roadmap_feature: F-31
---

# ADR-007: F-31 External Receipts and Fixed Harness Tool Profiles

## Status

**Accepted** as the current F-31 boundary. This revision supersedes the
previous assignment/submission/review Wave A design in this ADR. It does not
change F-30 or ADR-008, and it does not authorize AFOL to run model work.

## Context

AFOL owns project governance, lifecycle state, evidence, and deterministic
validation. External harnesses own model execution. A previous F-31 draft
treated AFOL as a multi-agent coordinator with a `dispatch` → `submit` →
`review` protocol and assignment state. That boundary would make AFOL select,
call, schedule, retry, or supervise models, which is outside the product and
cannot be proved by AFOL lifecycle evidence.

F-31 instead needs a narrow ingestion boundary: a harness emits an external
receipt for work it ran, together with the fixed tool profile under which the
run happened. AFOL validates the receipt and profile metadata, records observed
evidence, and projects the existing lifecycle. The harness remains responsible
for provider/model choice and all execution control.

### Superseded scope

The terms `dispatch`, `submit`, `assignment`, `claimed`, `rejected`, and
`accepted` describe the superseded design only. They are not active F-31
commands, delivery states, leases, or authority claims. Historical references
may retain those words when explaining why this boundary changed.

## Decision

### 1. Product boundary

| Surface | Responsibility |
| --- | --- |
| External harness | Select provider/model, call the model, expose the fixed tool profile, schedule work, retry failures, and supervise the run. |
| AFOL | Provide governed context and lifecycle surfaces; validate receipt/profile integrity; record observed evidence; project State Board state and indexes. |
| Human or external policy | Choose the harness/profile and approve any work that requires an explicit policy decision. |

AFOL must never select, call, schedule, retry, or supervise a model. AFOL may
validate a receipt and run bounded deterministic project checks, but those
checks are not model orchestration.

### 2. External receipt contract

An external receipt is an append-only observation from a harness. At minimum it
binds:

```text
receipt_id
project_id / session_id / task_id
harness_id / run_id
harness_profile_id / harness_profile_digest
source_commit / head_commit (or equivalent artifact identity)
diff_hash / checked_paths
check_command / check_exit_code (when a check was run)
tool_trace_digest
started_at / finished_at
result
```

The receipt is evidence about an external run, not an assignment token, worker
claim, or capability grant. AFOL rejects a receipt that is malformed, unknown to
the fixed profile catalog, profile-digest mismatched, out of scope, or unable
to establish its declared provenance. A receipt never authorizes a model or
mutates the State Board by itself.

### 3. Fixed harness tool profiles

Tool profiles are versioned, generated harness metadata derived from the
registry-backed AFOL tool catalog. A profile contains a stable id, version,
description, and the allowed AFOL tool ids for that harness role. The profile
is fixed for a run and its digest is recorded in the receipt.

AFOL publishes this static metadata; the external harness pins and uses the
profile for its run. AFOL does not execute, schedule, or supervise the profile.
Profiles describe the tool surface only. They do not select a provider or
model, and `enforcement: none` remains an honest metadata boundary until a
separate governed decision adds enforcement. A missing, unknown, or changed
profile makes a receipt incomparable and fails closed.

### 4. Lifecycle projection

The State Board remains the only lifecycle state source of truth:

```text
pending | in_progress | problem | done | moved
```

There is no second assignment/delivery state axis. A validated external receipt
plus observed evidence may support the normal lifecycle transition to `done`;
the receipt itself does not write `done`, close a session, or authorize
governance. The existing single-actor path (`st` / `d -x` / `c`) remains valid.

### 5. Storage and trust

- External receipts remain project-local AFOL evidence and must be bounded,
  redacted, hash-addressed, idempotent, and linked to the correct project and
  session.
- Profile metadata is static and provider-neutral; it is not authentication,
  an OS isolation boundary, or a worker capability claim.
- Raw external transcripts are not stored by default. Unknown formats,
  ambiguous links, missing digests, and secret-like content fail closed.
- F-30 Evolution and ADR-008 retain their separate receipt/evidence contracts;
  F-31 must not alter the Evolution database or suggestion receipt lifecycle.

### 6. Rollout and verification

The F-31 receipt/profile path is opt-in until its schema, catalog generation,
and validation gates are shipped. Before calling it implemented, verify:

- [ ] Fixed profile catalog is generated from the current registry and has
      stable ids, versions, and tool ids.
- [ ] Receipts require a known profile id and matching digest.
- [ ] Invalid, stale, out-of-scope, duplicate, or secret-like receipts fail
      closed without lifecycle mutation.
- [ ] A valid receipt can be linked to observed evidence and normal lifecycle
      projection without AFOL starting or controlling model work.
- [ ] Tests prove AFOL does not select/call/schedule/retry/supervise models.
- [ ] Fresh observed evidence is recorded on an F-31 governed session.

## Options considered

1. **AFOL dispatch/submit/review runtime** — rejected; it creates an internal
   model-orchestration authority and the old assignment state machine.
2. **Unstructured external reports** — rejected; profile and provenance drift
   make results incomparable and unsafe to project.
3. **External receipts with fixed harness profiles (chosen)** — keeps model
   execution outside AFOL while retaining bounded, auditable evidence.

## Consequences

Positive:

- AFOL has a small, auditable boundary for work performed by any external
  harness.
- Tool access and benchmark comparisons use fixed profile metadata instead of
  implicit model-orchestration assumptions.
- F-30 Evolution and F-31 receipts remain separate product contracts.

Negative / deferred:

- Harnesses must implement receipt emission and profile pinning themselves.
- Profile enforcement, remote attestation, and cross-worktree coordination
  require separate governed work; they are not implied by this ADR.
- Existing assignment/submission implementation ideas are historical and must
  not be revived as active commands.

## Implementation status

accepted (F-31 external receipt/profile boundary); runtime implementation and
release proof remain pending.
