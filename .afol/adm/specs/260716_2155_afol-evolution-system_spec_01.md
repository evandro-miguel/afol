---
doc_type: spec
id: 260716_2155_afol-evolution-system_spec_01
theme: afol-evolution-system
status: active
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Govern the AFOL Evolution product and its delivery slices
created_at: '2026-07-16T21:55:00-03:00'
updated_at: '2026-07-16T21:55:00-03:00'
roadmap_feature: F-30
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  adr: .afol/adm/decisions/ADR-008-afol-evolution-autonomy-and-evidence-boundary.md
  schema: .afol/adm/schema/evolution-v1.schema.json
  ux: .afol/adm/ux/260716_2155_afol-evolution-system_ux-journey_01.md
  adoption_child: .afol/adm/specs/260716_2155_f18-s10-memory-library-adoption-loop_spec-child_01.md
  submission_child: .afol/adm/specs/260717_agent-submission-and-batch-review_spec_01.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - cli
  - .afol
  - .agents/skills
  - docs/lessons
  packages:
  - evolution core
  - evidence ingestion
  - proposal lifecycle
  - evaluation
risk_level: high
---

# SPEC: AFOL Evolution System

## 1) Intent

Create a project-local, evidence-first evolution system that learns from AFOL
sessions, user corrections and choices, recurring failures, execution metrics,
explicitly imported harness sessions, technical research, and later outcomes of
approved improvements. The system may observe, organize, relate, measure, and
suggest automatically. Critical changes remain under user or policy approval.

The system extends existing AFOL workbench, evidence, telemetry, maintenance,
lessons, memory, library, start briefing, and Universal Skills surfaces. It
must not create a second canonical knowledge structure.

## 2) Problem

AFOL can already record sessions, evidence, feedback, maintenance, lessons,
memory, and library claims, but those surfaces are not connected by a
controlled learning loop. Repeated friction can remain invisible, useful
preferences lack confidence and temporal freshness, and later evaluation is
not consistently tied to the proposal that caused a change. External harness
transcripts also need an explicit, bounded, redacted ingestion boundary.

## 3) Governing flow

```text
Observer -> Analyst -> Proposal -> Critic -> User/Policy -> Apply -> Evaluate
```

- Observer collects AFOL evidence and explicitly authorized external imports.
- Analyst normalizes, redacts, relates, clusters, scores, and identifies gaps.
- Proposal records the problem, evidence, frequency, impact, change, risk,
  validation, baseline, and expected outcome.
- Critic tests the proposal for safety, scope, evidence quality, and regression
  risk; a component may not approve its own change.
- User or policy approves the proposal according to the autonomy matrix.
- Apply uses the normal AFOL workbench and mutation lifecycle.
- Evaluate compares later comparable sessions and enters canary, stable,
  needs-more-data, regressed, rolled-back, or superseded state.

## 4) Product modes

### Daily suggestion

On the first session of a local calendar day, AFOL may show one concise,
report-first suggestion per project. The receipt is keyed by that immutable
calendar date in the project IANA timezone; it is not keyed by a production
ordinal. The suggestion must include the observed problem, related sessions,
occurrence count, distinct production days, impact, recommendation, risk, and
validation action. Secondary candidates are shown as `+N` pending work in
`afol evolve status`. Critical security and integrity conditions are separate
alerts, not ordinary suggestions.

The receipt is shared by all harnesses through project identity and local date.
The first claimant receives a short TTL lease and records `shown`, `skipped`,
`accepted`, or `rejected`. Skip keeps the candidate pending for reprioritization;
reject records a reason, lowers confidence, and suppresses recurrence until
materially new evidence exists.

### Intentional evolution

`afol evolve` performs analysis and preview only. It may read relevant AFOL
artifacts and already-authorized normalized imports, produce a scorecard, and
present a small prioritized proposal set. It does not write rules, skills,
configuration, code, specs, ADRs, roadmap, or canonical knowledge, and does not
append a journal event during analysis. The separate `afol evolve suggest
--first-session` flow may write only its fenced/idempotent receipt projection
and canonical receipt claim event; a later operator choice appends the decision
event. Neither path mutates canonical knowledge.
Approved changes enter a standard AFOL session, are validated, and remain in
canary until the configured evidence window is complete.

## 5) Evidence and trust boundaries

Every candidate and proposal must preserve source references. Observations
distinguish explicit user statements, inferred behavior, structural policy, and
external evidence. Preferences never override current user instructions,
security, specs, ADRs, rules, platform constraints, or other higher-precedence
policy.

External content is untrusted data, never executable instruction. Imports are
explicit-command only, versioned by adapter, redacted before normalized
storage, bounded, hash-addressed, resumable, idempotent, and linked to a
project only with sufficient evidence. Unknown formats and ambiguous links
fail closed or require confirmation. Raw transcripts are not stored by default.

## 6) Domain contracts

### Configuration and migration

The existing `.afol/config.json` contract remains `schema_version: 1` with
`project`, `paths`, and current provider sections. Evolution extends that
document with stable `project.id`, validated IANA `project.timezone`, four
evolution paths, and the `evolution` section. Old projects without these fields
continue to validate with documented defaults and no silent rewrite; generating
the stable id or persisting migrated defaults is an explicit configuration
mutation in Slice 1. The separate evolution state export is not a replacement
for project configuration.

### Canonical and derived state

`.afol/data/events/evolution/**` is the AFOL append-only canonical event journal
for receipt claims/decisions, production-day allocation, import
acceptance/digests, links, proposals, approvals, mutations, evaluation,
rollback, and tombstones. Entries are hash-linked and checked for local tamper
evidence, but a project-root writer can rewrite or truncate the file and
recompute the digests; this is not immutable storage or authenticity against a
malicious local writer and never authorizes a critical change.
The first-release concurrency boundary covers cooperative AFOL processes and
agents, whose journal and projection operations are serialized by AFOL locks
and database transactions. An arbitrary filesystem writer able to mutate,
replace, rename, or otherwise alter project-root components is outside the
containment and authenticity boundary on every supported OS. Static checks
fail closed before opening or writing: targets must remain under the configured
root and be regular files; symlinks, reparse points/junctions, hardlinks whose
identity cannot be proven, FIFOs, sockets, devices, and other non-regular
targets are rejected. These checks do not claim TOCTOU resistance or
`openat2`, `dirfd`, or equivalent kernel-enforced no-follow guarantees.
`afol evolve status` remains read-only, and no critical authorization derives
from the journal or its digests.
`.afol/state/evolution.db`, receipt rows, clusters, scores, caches, and exports
are derived projections. They may be rebuilt deterministically from the
canonical journal plus existing AFOL canonical sources, and derived-state GC
may not remove or rewrite journal evidence. Every journal entry retains the
canonical payload as well as its digest; digest-only events are insufficient
for deterministic rebuild. Journal-backed projections such as imports, links,
observations, production days, receipts, proposals, evaluations, decisions,
and tombstones retain their `journal_event_id`.

### Production days

A production day is a local date with at least one durable, verifiable result;
it is distinct from a calendar date used for suggestion receipts. Qualifying
results include a completed task with observed evidence, a closed session with
artifact/diff, a project-linked merge/release, or externally linked delivery.
Reads, status,
maintenance-only runs, and unlinked imports do not qualify. Each date counts
once and receives a monotonic production ordinal (`PD-0001`, ...) plus its
integer sequence (`1`, ...). Preference and observation integer fields store
that sequence; the `PD-*` value is the stable display/reference id. Freshness
and evaluation windows use production ordinal distance, not elapsed calendar
days or receipt dates.

### Preferences

Preferences are project-local by default and retain statement, scope, status,
confidence, effective confidence, positive/negative evidence, production-day
timestamps, and source references. Evidence separates `explicit`, `inferred`,
and `structural`. Initial freshness is full before age 7, linearly decays from
age 7 through 19, and reaches zero at age 20; the preference becomes dormant,
not deleted. Compatible evidence reactivates it; explicit contradiction reduces
confidence immediately. Inferred preferences never become rules automatically.

### Recurrence

Deterministic fingerprints use error code, test, command, path/module,
operation, workflow step, stack digest, and provider. Semantic similarity is
optional and must preserve every underlying occurrence. Defaults for a
recurring cluster are at least three occurrences across two sessions and two
production days. A user correction such as “this already happened” may mark a
cluster as confirmed recurrence and raise priority. States are
`observed`, `candidate`, `recurring`, `proposal_open`, `mitigation_canary`,
`resolved`, `reopened`, and `dismissed`; code change alone does not resolve a
cluster.

### Metrics and evaluation

Use a scorecard instead of one opaque quality number:

- rework: recurring issues, reopened tasks, repeated corrections,
  rollbacks, and repeated instructions;
- regressions: failed-again tests, compatibility breaks, and integrity errors;
- user load: interventions, repeated questions, unnecessary approvals, and
  turns to delivery;
- outcome: completed tasks, acceptance criteria, tests, delivered functions,
  and resolved problems;
- efficiency: duration, p50/p95, tokens, tool calls, retries, context, and
  output.

Comparison is restricted to similar task types. A speed gain is rejected when
security, integrity, quality, recurrence, regression, or user load worsens.
Insufficient comparable data leaves the proposal in canary.

## 7) Autonomy matrix

Automatic: observing AFOL sessions, derived counters and indexes, preference
decay, candidate suggestions, one daily receipt, candidate lessons, and
bounded cleanup of derived state. Explicit command required: external import,
ambiguous linking, and raw retention actions. Approval required: claims in the
library, rules, skills, `AGENTS.md`, configuration, specs, ADRs, roadmap, code,
global preference promotion, deletion of canonical knowledge, and any change
outside the low-risk allowlist.

Low-risk auto-apply is absent until Slice 7. When Slice 7 lands in the first
release, its initial mode is `canary` and requires every criterion:
allowed path, at most two files and 80 changed lines, append-only/generated
section, no executable behavior or critical surface, evidence references,
mutation journal and undo, and passing validation. Operators may always select
`none`. `lessons_memory_only` cannot become the default until canary evaluation
succeeds and an explicit policy/configuration change is approved.

## 8) Planned implementation slices

0. Governance: parent spec, autonomy ADR, import threat model, data schemas,
   UX journey, acceptance metrics, and canonical-versus-derived boundary.
1. Core: evolution config/defaults/validation, stable project UUID, explicit
   IANA timezone, separate `evolution.db` migrations,
   health, and production-day ledger.
2. Preferences: evidence model, confidence, precedence, decay, dormant state,
   reactivation, and contradiction handling.
3. Observations: workbench/evidence/feedback/telemetry/test ingestion,
   fingerprints, recurrence clusters, user-confirmed recurrence, scorecards,
   and comparable-task baselines.
4. Suggestions: ranking, one-per-project/day queue, TTL claims, skip/reject,
   reminders, pending counts, and separate critical alerts.
5. CLI: `afol evolve`, `status`, `suggest`, `analyze`, proposal review and
   decision flows; analysis remains read-only until approval.
6. Imports: adapter contract, Codex and Pi first, then OpenCode, Hermes, Grok,
   and generic versioned JSONL; streaming, cursors, redaction, idempotency,
   resumability, linking, and hostile-transcript tests. `auto_verified` linking
   must resolve the SHA as a commit object in the current repository and match
   the local project UUID; missing, nonexistent, and other-repository commits
   are negative tests in this slice.
7. Apply: bounded lessons/memory changes, immutable proposal digest, canonical
   journal, undo, validation, and initial first-release
   `auto_apply_mode: canary`; `none` remains available and critical surfaces
   remain approval-only.
8. Evaluate: baseline windows, comparable sessions, canary, stabilization,
   reopening, rollback, and later outcome measurement.
9. Universal Skills: read-only `good-morning` and `session-retro` integration;
   evolution state and business logic remain in AFOL.

## 9) First-release non-goals

- continuous daemon or silent provider/chat ingestion;
- cloud synchronization or raw transcript persistence by default;
- automatic rule, skill, config, spec, ADR, roadmap, or code changes;
- automatic merge, global preference promotion, or continuous research;
- a single quality score or replacement of canonical Markdown/YAML surfaces;
- automatic deletion or archival of canonical knowledge.

Slice 0 is governance/schema only: no runtime/config mutation, LLM call,
external import, automatic apply, or daemon. Slice 1 introduces the compatible
config and persistence foundation without changing critical surfaces.

## 10) Acceptance and Definition of Done

- `afol evolve` exists and its no-argument form is analysis/preview only.
- Daily suggestions are deduplicated by project and local calendar date,
  including concurrent Codex/Pi/OpenCode claims; skip and reject semantics are
  preserved.
- Production ordinals drive preference freshness: full before 7, decay at 7,
  and no automatic guidance at 20; reinforcement reactivates a dormant entry.
- Recurring issues are evidence-linked, session/day-aware, and reopened when
  the failure returns.
- External imports are explicit, redacted, bounded, idempotent, resumable,
  project-linked with confidence, and safe against prompt injection.
- Automatic external-session links require both the local project UUID and a
  commit object resolved in the current repository; schema shape alone is not
  accepted as runtime proof.
- Rules, skills, configuration, specs, ADRs, roadmap, code, and global
  preferences never change silently.
- Every applied proposal has baseline metrics, target metrics, comparable
  session minimum, production-day window, canary state, validation results,
  and rollback outcome.
- Derived evolution state can be rebuilt and cleaned without deleting
  canonical knowledge.
- Linux and Windows path/timezone/concurrency behavior is covered by tests;
  required release, integrity, secret, and dependency gates pass.

## 11) Dependencies and follow-ons

- F-18.S10 remains the first adoption consumer: it may use F-30’s read-only
  candidate-review path to connect completed workbench artifacts to reviewed
  memory/library proposals. Promotion remains governed by existing memory and
  library flows.
- Existing F-18 memory/library/context contracts remain authoritative; F-30
  must not duplicate their canonical stores.
- Universal Skills distributes `good-morning` and `session-retro` behavior but
  does not own evolution state or ranking logic.
- External adapters and low-risk application are deferred until the core
  ledger, evidence, and governance gates are stable.

## 12) Risks and controls

- False recurrence or preference inference: keep deterministic evidence,
  preserve source refs, and require approval for promotion.
- Prompt injection or secrets in imports: explicit command, redaction,
  non-execution boundary, size limits, hashes, and fail-closed parsing.
- Noisy daily UX: one suggestion, shared receipt, TTL claim, and separate
  critical alerts.
- Speed improvements hiding regressions: scorecard precedence and canary
  evaluation block acceptance when quality or integrity worsens.
- Derived-state drift: explicit migrations, rebuild paths, health checks, and
  source-hash validation.
