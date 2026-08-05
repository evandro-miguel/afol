---
doc_type: spec
id: 260731_hot-path-observability-and-derived-state-separation_spec_01
theme: hot-path-observability-and-derived-state-separation
status: final
implementation_status: implemented
owners:
- F-32 governance owner
workstream_intent: feature
artifact_purpose: Define bounded hot-path observability and the canonical-versus-derived state boundary for F-32.
created_at: '2026-07-31T00:00:00-05:00'
updated_at: '2026-07-31T00:00:00-05:00'
roadmap_feature: F-32
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  f03_latency: .afol/adm/specs/260521_0030_agent-command-design-system_spec_01.md
  f07_state: .afol/adm/specs/260521_0070_local-state-index-and-event-log_spec_01.md
  f18_health: .afol/adm/specs/260612_temporal-health-freshness-token-budget_spec-child_01.md
  f22_safety: .afol/adm/specs/260710_core-integrity-and-transaction-safety_spec_01.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - status/start/done/close command boundaries and lifecycle orchestration
  - canonical workbench task, evidence, State Board, log, and report writes
  - telemetry call boundaries and bounded benchmark instrumentation
  - local-state indexes, health, freshness, catchup, and explicit rebuild paths
  - focused regression, recovery, and hot-path benchmark contracts
  packages:
  - AFOL CLI
risk_level: high
---

# SPEC: Hot-Path Observability and Derived-State Separation (F-32)

## 1) Intent

Keep the common AFOL command path fast and predictable while making its failure
and measurement boundaries explicit. The four hot-path commands are:

status / start / done / close

They may expose bounded process-local or explicit benchmark instrumentation,
but their default execution must not write telemetry or perform hidden health,
catchup, or derived-state rebuild work. Canonical lifecycle files remain the
source of truth and are written before optional observability and projections.

The intended flow is:

canonical lifecycle write → bounded auxiliary diagnostics → explicit derived rebuild/catchup

F-32 is a boundary and ordering contract, not an event-log migration or a new
state store.

## 2) Authorization status

| Item | Status |
| --- | --- |
| Product direction | authorized |
| Hot-path instrumentation contract | implementation slice authorized |
| Canonical-before-auxiliary ordering | implementation slice authorized |
| Default status without health/derived work | implementation slice authorized |
| Explicit rebuild/catchup recovery | implementation slice authorized |
| Event-log migration | **forbidden in F-32** |
| F-30 Evolution changes | **forbidden in F-32** |
| Provider/model orchestration | **forbidden** |
| Release proof | not authorized until gates pass |

## 3) Problem and boundary

### 3.1 Hot-path observability

- status, start, done, and close may collect bounded duration, call, output,
  and derived-work counters for tests or an explicit benchmark result.
- Instrumentation is process-local or written only to an explicitly requested
  benchmark artifact. It must not append tool_exec, task_start,
  task_complete, session_start, session_end, or replacement records to
  the telemetry/event store on the default path.
- Telemetry query/report/export surfaces remain read-only consumers. Their
  schema and existing event-log append contract are not migrated by F-32.
- Instrumentation failures are non-blocking warnings only when the canonical
  operation already committed; they must not turn an otherwise durable
  lifecycle result into a false success or trigger hidden retries.

### 3.2 Status and derived work

- Default afol status reads canonical session/task status and stays free of
  session-health collection, full health checks, local-state rebuilds, and
  catchup/Git freshness scans.
- status --health, status --catchup, afol health, afol catchup, and
  afol local-state rebuild remain explicit opt-in operations. Output must
  distinguish health or freshness that was not requested from health that was
  unavailable or failed.
- No caller may infer that an unrequested health check passed. Explicit
  derived commands are idempotent and may report stale, degraded, or failed
  projections without changing canonical lifecycle state.

### 3.3 Canonical lifecycle ordering

The State Board and canonical workbench artifacts remain authoritative:

| Command | Canonical write that must complete first | Auxiliary work after commit |
| --- | --- | --- |
| start | task State Board transition to in_progress (and its attempt metadata) | diagnostics and explicit projection refresh |
| done | passed observed evidence authorization, then State Board transition to done | diagnostics and explicit projection refresh |
| close | close report/waiver, log summary, and closed task metadata | diagnostics and explicit projection refresh |
| status | read-only; no lifecycle mutation | none unless an opt-in flag is present |

Canonical write failure remains a command failure. Once a canonical write is
durable, auxiliary failure cannot roll it back or cause a second canonical
write. Evidence remains the completion authorization, the State Board remains
the only lifecycle state source, and close retains strict verification,
report-summary, and missing-report waiver semantics.

### 3.4 Derived-state separation

Indexes, health summaries, freshness/catchup reports, and other projections are
rebuildable derived state. They must not be required for a successful canonical
start, done, or close, and they must not be silently rebuilt as a side
effect of default status. Recovery uses explicit, bounded commands such as:

    afol local-state rebuild --json
    afol catchup --session <session-id>
    afol status --catchup --session <session-id>
    afol health --area <area>

The exact command surface remains the existing AFOL registry contract; F-32
does not add a watcher, daemon, or implicit background repair path.

## 4) Authorized implementation slice

1. Add focused timing/call instrumentation at the four command boundaries with
   no default telemetry writes and bounded output.
2. Remove hidden health, catchup, and derived rebuild work from default
   status; retain explicit --health and --catchup behavior.
3. Ensure start, done, and close perform canonical writes before any
   telemetry, index, health, or other auxiliary operation. Preserve the
   existing warning and rollback behavior for auxiliary/canonical failures.
4. Keep evidence ledgers, State Board transitions, close reports/logs, strict
   verification, and event-log append semantics compatible with their current
   contracts.
5. Add focused tests for ordering, no-telemetry behavior, default-status
   isolation, explicit derived recovery, duplicate safety, and warnings.
6. Add a versioned benchmark scenario for status, start, done, and close, with
   default and opt-in derived paths measured separately.

No implementation slice may migrate the event log, alter F-30 Evolution or
F-31 receipts/profiles, or select, call, schedule, retry, or supervise models.

## 5) Out of scope

- Event-log schema, storage, retention, or historical migration
- F-30 Evolution observation, recurrence, autonomy, or derived evolution state
- F-31 external receipt/profile validation and harness boundaries
- Provider/model selection, invocation, scheduling, retries, or supervision
- A background daemon, watcher, queue, broker, or hidden retry loop
- Replacing the State Board, evidence authorization, close report, or strict
  verification contract
- Making health, catchup, index refresh, or hydration implicit again

## 6) Acceptance gates

- [x] Focused tests prove the four hot paths emit no default telemetry writes,
      including retries or error branches that follow a successful canonical
      write.
- [x] status default does not call health, catchup, Git freshness, index
      rebuild, hydration, or equivalent derived work; explicit flags/commands
      still exercise their documented behavior.
- [x] Tests prove canonical task/evidence/report/State Board writes occur
      before auxiliary diagnostics or derived projection work.
- [x] Evidence remains the only completion authorization; State Board states
      remain pending / in_progress / problem / done / moved and no parallel
      lifecycle state axis is introduced.
- [x] close preserves strict verification, report creation/waiver behavior,
      summary provenance, and recoverable log/task metadata.
- [x] Explicit rebuild/catchup is idempotent, bounded, and does not duplicate
      or mutate canonical evidence, State Board, or report records.
- [x] Event-log and telemetry schemas remain compatible, with no migration or
      replacement append path added by F-32.
- [x] Focused typecheck/tests, manifest/project validation, security scans, and
      fresh observed evidence pass for the governed F-32 implementation slice.

## 7) Recovery and rollback gates

- [x] Injected auxiliary failure after start, done, or close leaves the
      canonical write durable, returns a bounded warning, and names the
      explicit recovery command; it does not retry or rewrite the lifecycle.
- [x] Injected canonical-write failure fails closed and leaves no misleading
      done/closed State Board or report claim. Existing atomic file and
      session-lock guarantees remain intact.
- [x] A failed or interrupted derived rebuild can be rerun safely from the
      canonical workbench/evidence files, with stale/degraded state reported
      explicitly until recovery succeeds.
- [x] Rollback removes only the F-32 instrumentation/order change and restores
      the previous command implementation without deleting evidence, reports,
      State Board history, or event-log records.
- [x] Recovery evidence includes afol verify-tasks SESSION_PATH --strict
      where lifecycle completion is involved, followed by explicit
      afol local-state rebuild --json or afol catchup as applicable.

## 8) Benchmark and performance gates

- [x] Benchmark status, start, done, and close on the same warm host, runtime,
      source/release artifact, and profile; collect at least 20 measured
      samples per scenario after declared warmups.
- [x] Record p50/p95 duration, authored argv characters, forced output bytes,
      telemetry append count, canonical-write count, and derived-work calls.
      Setup, fixture creation, and explicit recovery are measured separately.
- [x] Default status and lifecycle scenarios meet the F-03 local targets
      (p50 ≤ 100 ms and p95 ≤ 300 ms) unless a versioned compatible baseline
      records a stricter target; opt-in health/catchup runs are separate
      scenarios and never hide default-path regressions.
- [x] Every scenario remains within AFOL's output budget: default output is
      compact, no scenario exceeds 5,000 forced output tokens, and none reaches
      the 10,000-token hard ceiling.
- [x] A benchmark fails closed when default status performs derived work, when
      a lifecycle path appends telemetry, or when provenance/host/runtime
      compatibility is missing. A smoke run is not release proof.
- [x] Results and baselines carry scenario/version, Git SHA, timestamp, host
      profile, runtime, artifact mode/hash, sample and warmup counts, and the
      measured default/opt-in mode.

## 9) Risks and tradeoffs

- Risk: removing implicit refresh makes projections stale after a canonical
  write. Mitigation: return a concise warning/recovery hint and keep rebuild
  and catchup explicit, idempotent, and observable.
- Risk: instrumentation changes command behavior or output. Mitigation: keep
  counters bounded, process-local or explicitly requested, and gate output and
  latency in the benchmark.
- Risk: canonical and derived records diverge after interruption. Mitigation:
  canonical files remain recoverable source data; strict verification and
  explicit rebuild/catchup are required before claiming repaired projections.
- Tradeoff: telemetry aggregates no longer receive automatic writes from these
  four hot paths in this slice. This is accepted to protect latency and write
  reliability; telemetry schema/history is retained and no migration is part
  of F-32.

## 10) Lifecycle of this document

- Planned backlog → **authorizing parent for F-32 hot-path separation and
  observability implementation** (this revision).
- Promote implementation_status to implemented only after acceptance,
  recovery, benchmark, security, and fresh observed-evidence gates pass.
- Child specs may decompose instrumentation, lifecycle ordering, derived
  recovery, or benchmark scenarios; they must not reintroduce hidden health,
  telemetry writes, event-log migration, F-30/F-31 scope, or model
  orchestration.

---

*Governing parent for F-32. Canonical lifecycle state remains authoritative;
derived state is explicit and rebuildable.*
