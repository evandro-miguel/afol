---
doc_type: spec
id: 260717_agent-submission-and-batch-review_spec_01
theme: agent-submission-and-batch-review
status: active
implementation_status: authorized_wave_a
owners:
- F-31 governance owner
workstream_intent: Authorize the one-worker submission and review implementation slice.
artifact_purpose: Governing parent for F-31; authorizes Wave A implementation under ADR-007.
created_at: '2026-07-17T00:00:00-03:00'
updated_at: '2026-07-29T00:00:00-03:00'
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
  - cli/modules/orchestration or cli/services/orchestration
  - cli/commands orchestration surface
  - workbench lifecycle projection only via completeObservedTask(s)
  - project-local assignment operational state
  - benchmark and validation contracts for the new path
  packages:
  - AFOL CLI
risk_level: high
---

# SPEC: Agent Submission, Review, and Integration (F-31)

## 1) Intent

Define a governed **delivery protocol** for multi-agent work:

```text
dispatch → submit → review/integrate → (internal) evidence → done → close
```

Workers own **delivery state**. Orchestrators own **acceptance**. AFOL owns
**verification and projection**. The existing lifecycle remains the projection
engine; it stops being the multi-agent cognitive API.

This feature is **F-31**. It is not an Evolution (F-30) child. ADR-007 is the
binding architectural decision.

## 2) Authorization status

| Item | Status |
| --- | --- |
| Product direction | authorized |
| Wave A design (ADR-007) | accepted |
| Wave A implementation | **authorized** |
| Public commands in registry | not yet shipped |
| Release / default-on for agents | not authorized until Wave A gates pass |

Earlier revisions of this document were backlog-only and forbade implementation.
That non-authority clause is **superseded for Wave A only** by this revision and
ADR-007.

## 3) Boundary (normative)

### 3.1 Dual axes

- **Lifecycle (State Board):** `pending | in_progress | problem | done | moved`
- **Delivery (assignment store):** at least
  `assigned | claimed | submitted | blocked | rejected | accepted`

Never put `submitted` on the State Board as a lifecycle value.

### 3.2 Authority

- Worker submissions are declarative and **non-authorizing**.
- Only review/integrate may create **observed authorizing evidence** and project
  `done` through `completeObservedTask` / `completeObservedTasks`.
- Actor labels, assignment metadata, and assignment tokens are **not** OS
  authentication. They prevent accidental cross-assignment use (anti-confusion),
  attempt replay, and unauthorized accept/done from the worker role.
- Strong isolation remains an external launcher or OS boundary.

### 3.3 Integration receipt

Acceptance requires an `IntegrationReceipt` binding assignment, attempt, base
and head/integration commits, diff hash, paths, check command, and exit code.
`submitted ≠ done` until that receipt exists and checks were executed by AFOL
or the orchestrator path—not merely declared by the worker.

## 4) Wave A — authorized implementation slice

### 4.1 In scope

1. **Domain:** pure Job / Assignment / DeliveryState / IntegrationDecision
   transitions with unit tests; no filesystem in domain.
2. **Ports + project-local store:** atomic per-assignment files; CAS/revision
   as needed; no global multiwriter JSONL as authority.
3. **CLI (flag default off):** `dispatch`, `submit`, `review` (name `integrate`
   allowed as alias if registry prefers one verb). Handlers call use cases only.
4. **Same-worktree one-worker path:**
   - dispatch creates/reuses session + task(s), assignment, baseline, brief;
   - submit records delivery (clean tree, committed head, reproducible diff);
   - review/integrate revalidates scope/base/diff, runs check, writes receipt,
     then projects via `completeObservedTask` (one task) or
     `completeObservedTasks` (≥2 tasks, PR #75 API).
5. **Failure paths:** reject/resubmit; duplicate submit idempotency; crash
   between receipt and projection; path/base/attempt drift; flag-off inert.
6. **Tests + new bench scenario** outcome-oriented for the new commands.
   Do not rewrite `governed-task-lifecycle` ritual in the same PR as the first
   runtime land.

### 4.2 Out of scope (Wave A)

- Multiworker leases, heartbeat as model command, verification pools
- `$XDG_STATE_HOME` shared runtime as durable SoT
- Capability matrices / multi-tenant auth claims
- Daemon, broker, provider tool surface beyond CLI parity
- AGENTS.md / project-template parity rewrite (later wave)
- Reinventing batch lifecycle or multitask throughput gates already on `dev`
- Global action-policy completeness of the entire registry
- Evolution (F-30) runtime changes

### 4.3 Prerequisites for implementation PRs

- Rebase onto current `origin/dev` including PR #75 batch lifecycle and
  throughput gates (or equivalent).
- Do not start from closed PR #58 tip as merge base.
- Session governance: `roadmap_feature: F-31`, parent spec this document.

### 4.4 Acceptance gates (Wave A done)

- [ ] Flag `orchestration.submission_v1` default false; flag-off has zero
      orchestration side effects.
- [ ] Worker cannot mark done/close or write authorizing evidence.
- [ ] Review/integrate refuses stale base, out-of-scope paths, failed checks,
      wrong token/attempt.
- [ ] Successful accept produces IntegrationReceipt fields on/with observed
      evidence and State Board `done`.
- [ ] Deterministic tests cover reject/resubmit, idempotent submit, recovery
      after partial integrate.
- [ ] New registry commands + help entries exist; catalogs updated if required.
- [ ] New bench or focused e2e proves interaction shape
      (orch ≤2 explicit AFOL calls, worker ≤1 submit) on the new path.
- [ ] Fresh workbench evidence on an F-31 governed session.

## 5) Later waves (not authorized by this revision)

| Wave | Theme |
| --- | --- |
| B | Multi-worktree shared runtime (only if acceptance requires it) |
| C | Multiworker leases, conflicts, batch integrate |
| D | Role-minimal context, provider tools, AGENTS/template defaults |
| E | Dogfood, default-on rollout, deprecation of lifecycle from agent help |

Each later wave needs its own authorizing update or child spec.

## 6) Closed PR #58 — reuse inventory (non-binding)

Historical PR #58 (`feat/f30-orchestration-runtime`, closed, not merged)
touched approximately:

| Path / area | Reuse stance |
| --- | --- |
| `cli/services/orchestration/index.ts` (~1k LOC) | redesign against current lifecycle; do not paste |
| `cli/commands/orchestration.ts` | shape reference only |
| `cli/tests/orchestration.test.ts` | mine adversarial cases |
| Catalog scenarios `cli-dispatch/submit/review-structured-error` | recreate if still useful |
| `live-submission-review` scenario | recreate with comparable token scope |
| lifecycle helpers (task snapshot, evidence reuse, close refresh) | re-check what PR #75 already landed before reintroducing |

Preferred adversarial cases to re-express on `origin/dev`:

- flag default off
- path / symlink escape
- base commit drift mid-review
- diff change during validation
- attempt fence / lease loss interaction with batch done
- worker attempting done/close
- duplicate submit / duplicate review idempotency

## 7) Non-goals forever (unless a future ADR says otherwise)

- Restoring `.agents` runtime or project-local `afol` wrappers for workers
- Workers editing the State Board as their inbox
- Workers writing authorizing evidence
- Daemonized orchestration broker as the default architecture
- Removing lifecycle commands from the operator/debug surface in Wave A

## 8) Lifecycle of this document

- Planned backlog (historical) → **authorizing parent for F-31 Wave A** (this
  revision).
- Promote implementation_status to `implemented` only after Wave A gates and
  observed evidence.
- Child specs may decompose domain/runtime/bench later; they must not reopen
  worker-authorized done.

---

*Governing parent for F-31. Evolution remains F-30 / ADR-008.*
