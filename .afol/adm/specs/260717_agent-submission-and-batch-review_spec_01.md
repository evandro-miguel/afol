---
doc_type: spec
id: 260717_agent-submission-and-batch-review_spec_01
theme: external-receipts-and-harness-profiles
status: final
implementation_status: implemented
owners:
- F-31 governance owner
workstream_intent: Define external receipt ingestion and fixed harness tool-profile contracts.
artifact_purpose: Governing parent for F-31; authorizes profile/receipt validation work under ADR-007.
created_at: '2026-07-17T00:00:00-03:00'
updated_at: '2026-07-31T00:00:00-03:00'
roadmap_feature: F-31
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  adr: .afol/adm/decisions/ADR-007-agent-submission-review-boundary.md
  related_evolution: .afol/adm/specs/260716_2155_afol-evolution-system_spec_01.md
  evolution_adr: .afol/adm/decisions/ADR-008-afol-evolution-autonomy-and-evidence-boundary.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - cli registry and generated tool catalog
  - external receipt/profile validation and evidence ingestion
  - workbench lifecycle projection only via existing AFOL lifecycle APIs
  - benchmark and validation contracts for fixed harness profiles
  packages:
  - AFOL CLI
risk_level: high
---

# SPEC: External Receipts and Fixed Harness Tool Profiles (F-31)

## 1) Intent

Define a governed boundary for work performed by an external harness. The
harness selects and runs models under a fixed tool profile, then emits an
external receipt. AFOL validates that receipt, records observed evidence, and
projects the existing lifecycle:

```text
external harness run → external receipt → AFOL validation → observed evidence
                                                    → normal lifecycle projection
```

AFOL is not a model orchestrator. It never selects, calls, schedules, retries,
or supervises models. This feature is **F-31**, distinct from the F-30
Evolution system and ADR-008.

### Superseded scope

Earlier revisions described a `dispatch` → `submit` → `review/integrate` path,
worker assignments, and a second delivery-state axis. That design is retired;
those terms are retained only in the historical inventory below and must not be
implemented as active F-31 commands or states.

## 2) Authorization status

| Item | Status |
| --- | --- |
| Product direction | authorized |
| ADR-007 boundary | accepted |
| Fixed tool-profile catalog | implementation slice authorized |
| External receipt schema/validation | implementation slice authorized |
| AFOL model orchestration | **forbidden** |
| Default-on provider/model execution | not applicable; execution remains external |
| Release proof | not authorized until gates pass |

## 3) Boundary (normative)

### 3.1 External harness

The external harness owns provider/model choice, invocation, scheduling,
retry policy, supervision, tool execution, and receipt emission. It pins one
versioned tool profile for each run and includes that profile id and digest in
the receipt. A profile describes the AFOL tool surface only; it is not a model
selection or authentication contract.

### 3.2 AFOL

AFOL provides governed context and lifecycle surfaces. It validates receipt
shape, project/session/task binding, profile id and digest, source/artifact
identity, checked paths, tool-trace digest, and any configured deterministic
check result. AFOL may record observed evidence and refresh projections after
validation. A receipt cannot mark a task done, close a session, grant a
capability, or authorize governance by itself.

### 3.3 Fixed harness tool profiles

The generated registry-backed tool catalog is the source of truth for profile
ids, versions, descriptions, and allowed AFOL tool ids. Profiles are static
metadata with an explicit catalog version and `enforcement: none` until a
future governed enforcement decision. A changed, missing, or unknown profile
makes a receipt incomparable and fails closed.

AFOL publishes this metadata; the external harness pins and uses one profile
for each run. AFOL does not execute, schedule, retry, or supervise a profile.

### 3.4 External receipt

Every accepted receipt binds, at minimum:

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

Receipts are append-only observations. Duplicate receipt ids are idempotent
only when their canonical content and profile digest match; conflicting or
secret-like payloads fail closed.

### 3.5 Lifecycle

The State Board remains the only lifecycle source of truth:
`pending | in_progress | problem | done | moved`. There is no assignment,
lease, claim, submission, or acceptance state axis. A validated receipt plus
observed evidence may support the normal transition to `done` through existing
AFOL lifecycle APIs; the external harness does not write State Board state.

## 4) Authorized implementation slice

1. **Profile catalog:** generate deterministic fixed tool-profile metadata from
   the registry-backed command catalog; expose version, profile ids, tool ids,
   and digestable content without selecting a model.
2. **Receipt contract:** define bounded, redacted, hash-addressed external
   receipt input and project/session/task binding.
3. **Validation:** fail closed for malformed receipts, unknown or mismatched
   profiles, path/provenance drift, duplicate conflicts, and secret-like data.
4. **Evidence projection:** link valid receipts to observed evidence and the
   existing lifecycle/index refresh paths only after validation.
5. **Tests and evidence:** deterministic tests cover profile drift, duplicate
   and conflicting receipts, invalid provenance, redaction, and the invariant
   that AFOL never starts or controls model work.

No implementation slice may add a model provider call, scheduler, retry loop,
supervisor, or AFOL command whose purpose is to dispatch or submit model work.

## 5) Out of scope

- AFOL provider/model selection or model invocation of any kind
- AFOL scheduling, retries, supervision, leases, or a daemon/broker
- `dispatch`, `submit`, `review`, or `integrate` as active F-31 commands
- Assignment, claim, worker-delivery, or acceptance state machines
- Remote attestation, hostile multi-tenant authentication, and OS isolation
- Shared `$XDG_STATE_HOME` runtime as a source of truth
- Changes to F-30 Evolution, its SQLite database, or ADR-008 receipt semantics
- Rewriting the existing single-actor lifecycle fast path

## 6) Acceptance gates

- [x] Generated profile catalog is deterministic, versioned, and derived from
      the current registry.
- [x] Receipt validation requires a known profile id and matching digest.
- [x] Invalid, stale, out-of-scope, duplicate-conflict, or secret-like input
      fails closed without lifecycle mutation.
- [x] Valid receipt evidence is bound to the correct project/session/task and
      can support ordinary AFOL lifecycle projection.
- [x] Tests prove AFOL never selects, calls, schedules, retries, or supervises
      a model.
- [x] Profile/receipt output remains bounded and redacted.
- [x] Fresh observed evidence exists on an F-31 governed session.

## 7) Historical implementation inventory (non-binding)

Closed PR #58 and the former assignment/submission design are historical test
ideas only. Do not revive its orchestration service, command handlers,
assignment store, tokens, leases, or delivery-state transitions. Re-express
only useful integrity cases against the external receipt/profile contract.

## 8) Non-goals forever (unless a future ADR says otherwise)

- Restoring `.agents` runtime or project-local `afol` wrappers
- Making AFOL an external-model scheduler, broker, or supervisor
- Treating a harness receipt as OS authentication or model capability authority
- Moving F-30 Evolution receipt/evidence logic under F-31

## 9) Lifecycle of this document

- Planned backlog (historical) → **authorizing parent for F-31 receipt/profile
  validation** (this revision).
- Promote `implementation_status` to `implemented` only after the gates and
  observed evidence pass.
- Child specs may decompose schema, catalog, validation, and ingestion; they
  must not reintroduce AFOL model orchestration or assignment states.

---

*Governing parent for F-31. Evolution remains F-30 / ADR-008.*
