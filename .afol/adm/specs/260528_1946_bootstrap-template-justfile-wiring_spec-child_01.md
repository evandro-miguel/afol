---
doc_type: spec-child
id: 260528_1946_bootstrap-template-justfile-wiring_spec-child_01
theme: bootstrap-template-justfile-wiring
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Capture the child scope that wires strict legacy just command-runner parity into the exported template baseline.
created_at: '2026-05-28T22:46:34Z'
updated_at: '2026-05-28T20:10:13-03:00'
roadmap_feature: F-17
spec_role: child
parent_spec: 260413_1849_just-command-runner-migration_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: 260528_1946_bootstrap-template-justfile-wiring_plan_01
  task: 260528_1946_bootstrap-template-justfile-wiring_task_01
  report: null
risk_level: low
---

# SPEC CHILD: bootstrap-template-justfile-wiring

## Intent

- Outcome: exported template legacy just command runner surfaces expose the strict aggregate validation commands already available at repo root.
- Roadmap feature: `F-17`
- Parent spec: `260413_1849_just-command-runner-migration_spec_01`

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- Use `spec-lite` only for historical compatibility during migration.

## Child Scope Rationale

- Root command parity is already accepted, but template exports still omit strict wrappers and docs references.
- This slice isolates template/bootstrap wiring from broader CI or runtime migration work.

## User or Operator Journey

1. Operator bootstraps or works from `src/project-template` baseline.
2. Operator runs aggregate validation commands from the template root.
3. Operator can use `all-strict` / `validate-strict` for governed closure checks with behavior matching root semantics.

## Boundaries

- In scope:
  - `src/project-template/legacy just command runner` strict alias wiring.
  - `src/project-template/docs/standards/legacy just command runner` strict aggregate and diff gate recipes.
  - Template docs mirrors that describe these commands.
- Out of scope:
  - Runtime package or MCP registration changes.
  - Broad CI migration changes outside focused template wiring.

## Risks and Mitigations

- Misaligned docs could reintroduce command confusion -> update template docs in the same slice as command wiring.

## Acceptance

- [x] Child scope is explicit and bounded
- [x] Parent spec linkage is explicit
- [x] Journey is clear without code
- [x] Delivery evidence target is clear in linked report

---

*Template: `docs/templates/spec-child.md`*
