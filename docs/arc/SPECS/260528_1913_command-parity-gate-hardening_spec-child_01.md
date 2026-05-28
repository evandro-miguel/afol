---
doc_type: spec-child
id: 260528_1913_command-parity-gate-hardening_spec-child_01
theme: command-parity-gate-hardening
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Capture the canonical child spec for scoped workstream implementation
  intent.
created_at: '2026-05-28T19:13:36-03:00'
updated_at: '2026-05-28T20:10:13-03:00'
roadmap_feature: F-17
spec_role: child
parent_spec: 260413_1849_just-command-runner-migration_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260528_1913_command-parity-gate-hardening_plan_01
  task: 260528_1913_command-parity-gate-hardening_task_01
  report: null
risk_level: low
---

# SPEC CHILD: command-parity-gate-hardening

## Intent

- Outcome: aggregate validation keeps `just all` parity while a stricter governed
  closure path is available and documented (`just all-strict` / `just validate-strict`).
- Roadmap feature: `F-17`
- Parent spec: `260413_1849_just-command-runner-migration_spec_01`

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- Use `spec-lite` only for historical compatibility during migration.

## Child Scope Rationale

- This slice is needed because parity drift exists between command behavior and
  standards docs (`check` alias and strict-verification visibility).
- Scope stays separate to avoid redesigning command architecture; it only
  hardens aggregate validation gates and mirror clarity.

## User or Operator Journey

1. Operator runs aggregate validation from repo root (`just all` or `just all-strict`).
2. For governed closure, operator uses strict aggregate gate (`just all-strict`).
3. Standards docs match live behavior, so closure commands are unambiguous.

## Boundaries

- In scope:
  - `Justfile` root strict alias parity.
  - `docs/standards/Justfile` strict/diff gate recipes.
  - `docs/standards/scripts-reference.md` and `docs/standards/agents-usage.md` mirror updates.
- Out of scope:
  - Runtime/package code changes.
  - MCP/tool registration changes.
  - Broad command redesign beyond aggregate gate hardening.

## Risks and Mitigations

- `just all-strict` could fail on unfinished active sessions -> this is intentional for governed closure; `just all` remains unchanged for routine validation.

## Acceptance

- [x] Child scope is explicit and bounded
- [x] Parent spec linkage is explicit
- [x] Journey is clear without code
- [x] Delivery evidence target is clear in linked report

---

*Template: `docs/templates/spec-child.md`*
