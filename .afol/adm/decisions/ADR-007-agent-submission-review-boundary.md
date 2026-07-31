---
doc_type: adr
id: ADR-007
title: F-31 Agent Submission, Review, and Integration Boundary
status: accepted
created_at: '2026-07-18T00:00:00-03:00'
updated_at: '2026-07-29T00:00:00-03:00'
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

# ADR-007: F-31 Agent Submission, Review, and Integration Boundary

## Status

**Accepted** for Wave A design authority and implementation authorization under
F-31. This ADR does not claim that public `dispatch` / `submit` / `review`
commands already exist in the registry. Runtime still requires the governing
spec Wave A slice, registered commands, deterministic tests, and fresh
observed evidence before any release claim.

## Context

AFOL optimized command size and stdout (F-03) more than multi-agent interaction
count. Orchestration today is still mostly lifecycle:

```text
new → start → evidence → done → close
```

plus status/radar/context. That multiplies model decisions and internal
effects. Batch lifecycle completion (`completeObservedTasks`, PR #75) reduces
projection cost for N tasks but does not define a delivery protocol between
orchestrator and worker.

A prior draft treated this lane as an F-30 Evolution child. Evolution already
ships as F-30 with ADR-008. A lesson preferred the inverse numbering; renumbering
Evolution would be destructive. Submission is therefore **F-31**, distinct from
Evolution.

Closed PR #58 prototyped a gated runtime; it must not be cherry-picked as the
merge base. Reuse adversarial test ideas only.

## Decision

### 1. Product shape

Visible multi-agent path (opt-in):

```text
Orchestrator: dispatch
Worker:       submit
Orchestrator: review / integrate
```

AFOL still runs lifecycle projection internally after acceptance:

```text
validation → observed evidence → done → report → close → projections
```

Single-actor path remains:

```text
st → d -x → c
```

Orchestration is **not** the forced default.

### 2. Dual state axes

| Axis | Owner | States (minimum Wave A) |
| --- | --- | --- |
| Canonical lifecycle | State Board / workbench | `pending`, `in_progress`, `problem`, `done`, `moved` |
| Worker delivery | Assignment store (project-local) | `assigned`, `claimed`, `submitted`, `blocked`, `rejected`, `accepted` |

Do **not** add `submitted` to the State Board as a lifecycle status.

Relation:

```text
claimed / working  → task may be in_progress
submitted          → task stays in_progress
accepted           → IntegrationReceipt + observed evidence → task done
rejected           → task stays open / problem as policy decides
```

### 3. Authority

| Actor | May | Must not |
| --- | --- | --- |
| Worker | claim/progress/submit/block for own assignment | `task.done`, `session.close`, authorizing evidence, governance write, accept |
| Orchestrator | dispatch, review/reject/accept, close after acceptance | treat worker declaration as proof |
| AFOL core | run checks, write observed evidence, project lifecycle, refresh indexes | accept worker-supplied capability lists as authority |
| Human | waiver, takeover, scope change | — |

### 4. Integration receipt before done

`submitted ≠ done`. Acceptance requires an `IntegrationReceipt` that at least
binds:

```text
assignment_id
attempt
base_commit (or Wave A equivalent baseline)
head_commit / integration_commit
diff_hash
checked_paths
check_command
check_exit_code
reviewer / integrate actor
```

Only after a successful receipt may AFOL call `completeObservedTask` or
`completeObservedTasks` (reuse PR #75 batch projector; singular for one task).
Submit never writes authorizing evidence.

### 5. Wave A storage and credential

- **Storage:** project-local AFOL-owned assignment files (atomic write, per
  assignment). Not State Board multiwriter inbox. Not SQLite as orchestration
  authority. Not `$XDG_STATE_HOME` as durable SoT in Wave A.
- **Worktree:** same-worktree one-worker proof first. Multi-worktree shared
  runtime deferred.
- **Credential:** assignment token + stored hash, actor, attempt, expiry for
  anti-confusion and single-use/idempotency. Explicitly **not** hostile
  multi-tenant authentication. Strong isolation remains OS/launcher-level.

### 6. Feature flag

```json
{ "orchestration": { "submission_v1": false } }
```

Default **off**. Flag-off must not create sidecars, mutate lifecycle, or change
help defaults for agents until a later governed rollout.

### 7. Benchmarks and metrics

- Keep ritual `governed-task-lifecycle` until a new outcome-oriented scenario
  exists for the submission path.
- Token `total = input + cached_input + output + reasoning` must be documented;
  do not treat that sum as economic cost until input-vs-cached contract is
  fixed. Separate agent messages from tool calls.
- ROI claims require same fixture, model, and token scope; mismatched snapshots
  are not proof.

### 8. Closed PR #58 reuse policy

Reuse as **test ideas only** (symlink/path escape, base drift, diff change
during validation, attempt fence, flag-off, structured errors). Do not merge
the closed branch wholesale; reimplement against current `origin/dev` lifecycle
batch APIs.

## Options considered

1. **Lifecycle-only multi-agent (status quo)** — lowest build cost; keeps high
   interaction cost and wrong authority for workers.
2. **Submission under F-30 Evolution** — ID collision and wrong product parent.
3. **F-31 submission plane (chosen)** — clear authority split; reuses lifecycle
   projection; Wave A same-worktree.

## Consequences

Positive:

- Orchestration becomes a product boundary, not a skill myth.
- Done stays honest (observed + receipt).
- Evolution (F-30) and Submission (F-31) no longer share one feature id.

Negative / deferred:

- Public commands and registry entries still need implementation PRs.
- Multi-worktree shared runtime and leases remain future work.
- Docs/AGENTS happy path stay lifecycle until Wave A is proven.

## Verification

Before calling Wave A implemented:

- [ ] Registry exposes `dispatch` / `submit` / `review` (or `integrate`) behind
      flag default off.
- [ ] Deterministic tests: wrong token, wrong attempt, path outside scope, base
      drift, duplicate submit, reject/resubmit, crash between receipt and
      projection, worker cannot done/close.
- [ ] Integrate path uses real check output, then `completeObservedTask(s)`.
- [ ] Flag-off: no orchestration side effects.
- [ ] New bench scenario (not only ritual lifecycle) with comparable metrics.
- [ ] Fresh observed evidence on a governed session bound to F-31.

## Status

accepted (Wave A design + implementation authorization); runtime not yet shipped.
