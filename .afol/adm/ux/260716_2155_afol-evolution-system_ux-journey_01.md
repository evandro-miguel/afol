---
doc_type: ux-journey
id: 260716_2155_afol-evolution-system_ux-journey_01
theme: afol-evolution-system
status: active
owners:
- F-30 governance owner
- maintenance-agent
- memory/library maintainers
created_at: '2026-07-16T21:55:00-03:00'
updated_at: '2026-07-16T21:55:00-03:00'
roadmap_feature: F-30
parent_spec: 260716_2155_afol-evolution-system_spec_01
source_spec: 260716_2155_afol-evolution-system_spec_01
---

# UX Journey: AFOL Evolution System

## Purpose

This journey is owned by the F-30 parent. The F-18.S10 adoption child is a
related dependency for the Memory/Library candidate-review path, not the owner
of the full Evolution experience.

- User or agent: project operator, orchestrator, reviewer, and delegated AFOL
  worker.
- Goal: learn from project evidence while keeping the user in control of
  canonical changes.
- Context: the first project session of a configured local calendar day, an intentional
  `afol evolve` review, or a later evaluation of an approved canary. The
  calendar date drives receipt dedupe; only qualifying durable work advances a
  separate production-day ordinal.

## Entry And Exit

- Daily entry: start briefing or `afol evolve suggest --first-session`.
- Intentional entry: `afol evolve` or a named subcommand such as `status`,
  `analyze`, `review`, or `after-merge`.
- Success exit: one evidence-backed suggestion is accepted, skipped, rejected,
  or no candidate is reported; intentional work ends with an explicit proposal
  decision and evidence.
- Recovery exit: an uncertain project link, sensitive content, missing source,
  or failed validation remains at preview/proposal and points to a safe review
  action.

## Facts, Assumptions, Unknowns

- Facts:
  - AFOL already provides workbench evidence, maintenance, Memory, Library, and
    start briefing surfaces; F-30 governs their evolution integration.
  - Slice 0 defines behavior only and does not expose an `afol evolve` runtime.
- Assumptions:
  - a compact daily suggestion can remain useful at one item per project/day;
  - comparable-task classification can be deterministic before semantic help.
- Unknowns:
  - which evidence volume requires optional semantic clustering;
  - what minimum canary sample is appropriate for each task category.

## Desired experience

The operator sees the smallest useful next decision. The system states what it
observed, where it came from, how often it occurred, what it proposes, the risk,
and how success will be measured. The operator never has to guess whether a
button/command mutates canonical knowledge.

## Flow

### Daily Suggestion

| Step | User sees | System action | Decision and recovery |
| --- | --- | --- | --- |
| 1. Detect first session | Compact briefing with health, maintenance, and at most one suggestion | Check project id + IANA-timezone local calendar date and claim a fenced receipt with TTL; allocate a production ordinal only when durable qualifying work exists | If another harness claimed it, show no duplicate and expose `+N` pending in status |
| 2. Explain | Problem, related sessions, occurrence count, production days, impact, recommendation, risk, validation | Read derived queue and source refs; do not call an LLM when evidence is unchanged | Missing or ambiguous evidence becomes an alert/blocked candidate, not a confident suggestion |
| 3. Choose | `evolve`, `investigate`, `skip`, or `reject` with short descriptions | Record `shown`, then decision, actor, time, and receipt fence | `skip` keeps pending for next day; `reject` requires reason and suppresses replay until material new evidence |
| 4. Continue work | Normal AFOL start/session flow | No rule, skill, config, code, Memory, or Library mutation from the suggestion | User can inspect later with `afol evolve status` |

### Intentional Evolution

1. **Preflight.** `afol evolve` checks project integrity and fresh derived
   state. A failure names the rebuild/health action and stops analysis.
2. **Scope.** The operator selects a project/session and review depth. External
   data is included only when previously imported by explicit command.
3. **Analyze.** AFOL reads relevant evidence, applies preference precedence and
   freshness, clusters recurrence, and builds a scorecard. Analysis is
   read-only and produces source-linked candidates.
4. **Preview.** Each proposal shows problem, evidence, frequency, impact,
   change, risk, validation, baseline, target metrics, and approval surface.
5. **Critique.** A separate critic/reviewer checks safety, evidence, scope,
   regression risk, and whether the proposal could be applied under policy.
6. **Decide.** The operator accepts, rejects with reason, or snoozes. Critical
   surfaces always require explicit approval and a workbench session.
7. **Apply.** Approved work enters the standard AFOL lifecycle. Slice 0-6 do
   not auto-apply. Slice 7 starts the first-release `canary` mode for low-risk
   lessons/operational memory within the allowlist; `none` remains selectable.
   Rules, skills, config, specs, ADRs, roadmap, code, and global promotion are
   never automatic, and `lessons_memory_only` remains gated on successful
   canary evaluation plus explicit policy/configuration approval.
8. **Evaluate.** Comparable later sessions and production days are measured.
   The proposal remains `canary`/`needs_more_data` until the minimum window;
   regressions trigger rollback or reopening.

## Expected Result

- Output: one compact suggestion or a bounded proposal preview with evidence,
  risk, approval surface, and validation plan.
- Durable state change: `afol evolve` analysis has none; a suggestion claim and
  later decision may each append one fenced receipt event to the canonical
  journal. Critical canonical knowledge changes require a separate approved
  lifecycle; only the bounded Slice 7 canary may use the pre-approved low-risk
  policy. Analysis results remain derived.
- Warning or review prompt: ambiguity, redaction failure, stale state, or a
  critical surface stops at preview and names the recovery action.
- Token/output budget: one primary item, `+N pending`, and detailed evidence by
  explicit status/review command.

## States And Recovery

| State | Meaning | User-facing action |
| --- | --- | --- |
| empty | No reusable candidate or no new evidence | Continue; not an error |
| shown | Daily receipt presented | Choose or leave pending |
| skipped | Candidate remains pending | Recheck next eligible day with updated score |
| rejected | Explicit reason recorded | Do not replay until materially new evidence |
| blocked | Integrity, link, redaction, source, or policy uncertainty | Investigate/repair; no mutation |
| proposal_open | Preview awaits critique/decision | Review evidence and risk |
| canary | Approved change is under observation | Collect comparable evidence |
| needs_more_data | No minimum sample yet | Keep unchanged and wait for evidence |
| regressed | Quality, integrity, recurrence, or user load worsened | Roll back/reopen and preserve journal |
| stable | Target met without disallowed regressions | Record evaluation and close proposal |

## Information architecture and copy rules

- Lead with the observed problem, not an abstract score.
- Show one primary action and expose secondary work as `+N pending`.
- Use “skip” for deferment and “reject” only for an explicit disagreement.
- Label evidence as `explicit`, `inferred`, `structural`, or `external`.
- Always show whether the next action is read-only, proposal-only, or mutating.
- Never display secrets, raw transcripts, or imported instructions as policy.
- Empty Memory/Library is valid; distinguish `no_candidate` from stale or
  blocked state.

## Metrics

- Daily dedupe: one normal suggestion per project/local date across harnesses.
- Decision clarity: every suggestion contains problem, evidence, impact, risk,
  and validation action.
- Safety: preview/reject/failure leaves canonical surfaces unchanged.
- Adoption: candidate review can distinguish no candidate, blocked evidence,
  and already adopted knowledge.
- Evaluation: minimum comparable sessions and production-day window are visible;
  speed-only gains cannot hide regression, rework, integrity, or user-load
  worsening.
- Accessibility/automation: JSON and compact human output expose the same
  decision fields; no state depends on color or an interactive-only control.

## Evidence

- UX registration and coverage: `afol ux validate --json`.
- Read-only intentional command: stable JSON envelope and no journal append.
  Suggestion preview is also read-only; an explicit claim/decision appends only
  its fenced receipt event, with source refs and digests.
- Proposal/apply/evaluate: workbench evidence, mutation journal, validation
  output, baseline/target metrics, and canary result.
- Residual uncertainty remains an explicit backlog item; it is not silently
  counted as adoption or improvement.

## Acceptance

- [ ] Daily and intentional entry/exit paths are explicit.
- [ ] One normal suggestion is shown per project/configured local calendar date;
      production-day ordinals remain a separate evidence metric.
- [ ] Skip, reject, empty, blocked, canary, regression, and recovery states are
      distinguishable in compact and JSON output.
- [ ] Preview and failure do not mutate canonical knowledge or critical
      surfaces.
- [ ] Every proposal shows source evidence, impact, risk, validation, baseline,
      target metrics, and approval policy.
- [ ] First-release apply remains explicit; later low-risk automation requires
      a separately approved canary slice.
