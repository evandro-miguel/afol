---
doc_type: spec-child
id: 260615_1350_recurring-problem-guardrails_spec-child_01
theme: recurring-problem-guardrails
status: final
closure_note: "Delivered: read-only governance contract, recurrence detection, lesson/rule/spec/similar-system surfacing, recurrence_detected plus recommendations, one-off exception messaging, and non-mutation behavior are covered by preflight command tests."
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define recurring-problem detection, heavy-verification recommendation,
  and rule-creation proposal as a read-only governance surface without blocking enforcement.
created_at: '2026-06-15T13:50:00-03:00'
updated_at: '2026-06-15T13:50:00-03:00'
roadmap_feature: F-18
spec_role: child
parent_spec: 260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent_spec: .afol/adm/specs/260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01.md
risk_level: medium
---

# SPEC CHILD: recurring-problem-guardrails

## Intent

- Outcome: when a user reports a problem that has happened before (detected via lessons, rules, or workbench artifacts), the preflight surfaces a recurrence signal and recommends heavy verification.
- Outcome: the agent proposes a general or specific prevention rule (or lesson update) when recurrence is detected, but never creates or modifies rules/lessons automatically.
- Roadmap feature: `F-18` (original parent spec track)
- Parent spec: `260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01`
- Constraint: this child spec is **read-only governance only**. No command, mutation, or enforcement behavior is introduced here.

## Problem

The parent spec (§8.8) requires recurring-problem detection and escalation, but:

- The existing preflight (`cli/commands/preflight.ts`) already searches lessons, rules, specs, and similar systems — but does not explicitly signal "this looks like a recurrence" for machine/agent consumption.
- There is no structured guidance on **what to do** when a recurrence is detected (recommend heavy verification, propose rule creation).
- There is a risk of auto-mutation: an agent could unilaterally update lessons or create rules without user approval. This spec explicitly forbids that.
- The orchestrator-rule-injection path (§8.11) depends on runtime/orchestrator infrastructure that is not yet present in the CLI; this spec cannot enforce that path.

## User or Operator Journey

1. User reports a problem or bug via chat, workbench, or CLI.
2. Orchestrator or operator runs `afol preflight "<problem description>"`.
3. Preflight returns, among other fields, `recurrence_detected: true/false` plus matching lessons.
4. If recurrence is detected, the agent **recommends** heavy verification steps (expanded test surface, regression checks, edge-case audit).
5. The agent **proposes** a prevention rule or lesson update. The user reviews and approves before any mutation.
6. If no recurrence is detected, normal one-off fix path applies.

Failure or friction points:

- Lessons may exist but use different terminology — the preflight tokenizer may miss them.
- A recurring problem may be documented in workbench sessions but not in lessons — the preflight does not currently index workbench artifacts.
- The agent may skip the recurrence signal and treat it as a one-off fix — the preflight does not enforce anything.
- The user may expect automatic rule creation — the spec explicitly forbids auto-mutation.

## Read-Only Contract

This spec enforces **no blocking checks**. Specifically:

1. `afol preflight` never exits non-zero due to recurrence detection.
2. No command creates, edits, or deletes rule or lesson files as a side effect of preflight.
3. No CI or validation gate fails because a recurring problem was handled without heavy verification or rule creation.
4. The `recurrence_detected` field is advisory — agents and operators may act on it or ignore it.

## Detection Contract

The preflight recurrence detection checks:

1. `docs/lessons/` — any lesson matching the problem description tokens.
2. `.afol/adm/rules/` — any rule whose title or body references the problem pattern (rules often encode recurring fixes).
3. Active workbench artifacts (future — out of scope for v1).

The recurrence signal is **detected = true** when lessons exist and at least one lesson matches query tokens. False positives are acceptable — the signal is advisory, not blocking.

## Heavy-Verification Recommendation

When recurrence is detected, the agent should recommend to the user:

1. Expand test surface: add edge-case, regression, and integration tests covering the recurring scenario.
2. Audit similar paths: check for the same pattern in related modules, specs, or workflows.
3. Review prior fix: inspect the previous lesson or rule to confirm the fix actually resolved the previous occurrence or was incomplete.
4. Verify forward coverage: ensure the fix is visible in docs, rules, or lessons for future agents.

The agent must not execute any of these steps without user approval.

## Rule/Lesson Proposal

When recurrence is detected, the agent should **propose** (never create automatically):

- A new or updated lesson entry in `docs/lessons/` capturing:
  - problem description
  - affected surface
  - fix applied
  - verification steps taken
  - related rules or specs
- A new or updated rule in `.afol/adm/rules/` if the problem pattern is general enough to warrant a prevention rule.
- A note in the active workbench plan/session recording the recurring-problem handling.

Proposal must be explicit ("Propose creating RULE-999-foo.md with content X") and must await user approval before any file mutation.

## Scope

In scope:

- Read-only recurrence signal in `afol preflight` output (`recurrence_detected` boolean, lesson references).
- Structured guidance (this spec) for agents on how to handle recurrence.
- Heavy-verification recommendation protocol (advisory, user-approved).
- Rule/lesson proposal protocol (advisory, user-approved).

Out of scope:

- Automatic creation or modification of lesson or rule files.
- Blocking enforcement (preflight non-zero exit, CI gate, validation gate).
- Orchestrator-runtime rule injection into delegated agents (depends on orchestrator runtime — tracked in parent spec as P1).
- Indexing of workbench sessions for recurrence detection (v2).
- Semantic or vector-similarity recurrence search (v2).

## Acceptance

- [x] `afol preflight` output includes `recurrence_detected` field (boolean).
- [x] When `recurrence_detected = true`, matching lessons are surfaced.
- [x] When `recurrence_detected = false`, the agent treats the problem as a one-off fix unless new evidence emerges.
- [x] When recurrence is detected, the agent proposes (does not auto-create) heavy verification and rule/lesson updates on the workbench, waiting for user approval before any mutation.
- [x] No CI, validation, or command fails because of recurrence_detected = true.
- [x] This spec is the authoritative reference for recurring-problem guardrails behavior.

## Risks and Mitigations

- Risk: `recurrence_detected` is ignored by agents.
  Mitigation: signal is advisory by design — this spec makes the recommendation protocol clear so agents that *want* governed behavior have a contract.
- Risk: false positives cause unnecessary heavy-verification proposals.
  Mitigation: proposals are user-approved, so the user can reject irrelevant proposals cheaply.
- Risk: auto-mutation happens despite the spec.
  Mitigation: the spec is the governance contract — enforcement comes from the parent spec's preflight and review gates, not from this child spec.
- Risk: lessons use different terminology than the problem description.
  Mitigation: preflight tokenization includes stemming-lite and multiple query expansion paths; signal is advisory anyway.

## Verification

- Unit tests for `recurrence_detected` in preflight search service:
  - Query matching existing lesson → `recurrence_detected = true`.
  - Query matching no lesson → `recurrence_detected = false`.
- Integration test for `afol preflight --json` containing `recurrence_detected`.
- Strict workbench validation and `just lint`.

---

*Template: `docs/templates/spec-child.md`*
