---
doc_type: spec-child
id: 260413_1250_project-template-source-separation_spec-child_01
theme: project-template-source-separation
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Capture the canonical child spec for scoped workstream implementation
  intent.
created_at: '2026-04-13T12:50:11-03:00'
updated_at: '2026-04-13T13:12:46-03:00'
roadmap_feature: F-16
spec_role: child
parent_spec: 260413_1250_project-template-source-separation_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260413_1250_project-template-source-separation_plan_01
  task: 260413_1250_project-template-source-separation_task_01
  report: 260413_1250_project-template-source-separation_report_01
risk_level: low
---

# SPEC CHILD: project-template-source-separation

## Intent

- Outcome: the first F-16 execution slice creates the project-template source,
  wires bootstrap to it, and finishes with a narrow scripts simplification pass.
- Roadmap feature: `F-16`
- Parent spec: `260413_1250_project-template-source-separation_spec_01`

## Child Scope Rationale

- This child spec exists because the parent feature has three coupled but
  independently verifiable risks: template extraction, bootstrap behavior, and
  script simplification.
- Runtime package relocation stays outside this child scope to keep the first
  slice reviewable.

## User or Operator Journey

1. Maintainer opens `src/project-template/` to inspect the downstream baseline.
2. Maintainer runs bootstrap full or partial install.
3. The target repo receives the sanitized scaffold without development history
   or duplicate command behavior.

## Boundaries

- In scope:
  - `src/project-template/` extraction.
  - Bootstrap source rewiring.
  - Focused tests and dry-run export validation.
  - Purpose-based `.agents/scripts/` simplification where parity is proven.
- Out of scope:
  - Root-level runtime package relocation.
  - Broad docs rewrites.
  - Public command removal without archive/parity evidence.

## Risks and Mitigations

- Exporting local state -> denied-path tests and dry-run tree inspection.
- Breaking partial bootstrap -> keep runtime compatibility tests green.
- Over-refactoring scripts -> only simplify duplicated behavior with parity
  evidence.

## Acceptance

- [x] Child scope is explicit and bounded
- [x] Parent spec linkage is explicit
- [x] Journey is clear without code
- [x] Delivery evidence target is clear in linked report

---

*Template: `docs/templates/spec-child.md`*
