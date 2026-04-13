---
doc_type: spec
id: 260413_1250_project-template-source-separation_spec_01
theme: project-template-source-separation
status: active
owners:
- orchestrator
created_at: '2026-04-13T12:50:00-03:00'
updated_at: '2026-04-13T12:53:44-03:00'
roadmap_feature: F-16
spec_role: parent
parent_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - src/project-template
  - .agents/scripts
  - .agents/runtime
  - docs/standards
  - README.md
  packages:
  - agentic-scaffold
risk_level: high
---

# SPEC: project-template-source-separation

## 1) Feature Intent

- Outcome: the exportable default project scaffold lives under
  `src/project-template/`, while the repository root remains the development
  workspace for evolving that scaffold.
- Why now: bootstrap currently copies from the live repo root, which makes it
  harder to see what downstream projects actually receive and increases the risk
  of exporting development history, caches, or duplicated command surfaces.
- Roadmap feature: `F-16`
- Role of this spec: parent feature intent.

## 2) Scope

In scope:

- Create a sanitized `src/project-template/` baseline for downstream projects.
- Update bootstrap to copy from the template source instead of direct repo-root
  paths.
- Add focused tests proving the exported baseline is complete and history-free.
- Run a final `refactor-workflows` pass over `.agents/scripts/` to remove
  duplicate responsibilities and keep each script purpose-defined.

Out of scope:

- Rewriting the whole runtime package in the first template-separation slice.
- Publishing long narrative documentation beyond the minimal command and
  boundary updates needed for operators.
- Deleting public command scripts without parity evidence and an archive path.

## 3) Experience and Behavior

- Maintainers can inspect `src/project-template/` to see the exact default folder
  installed into projects.
- Bootstrap supports full and partial installs from that template without
  copying local workbench state, telemetry events, caches, virtualenvs,
  `node_modules`, or scaffold-specific map/spec history.
- Scripts remain purpose-based: one command path per responsibility, shared
  helpers for repeated behavior, and no duplicate scripts performing the same
  work under different names.

## 4) Child Spec Strategy

- Child specs required: yes if execution is split across template extraction,
  bootstrap wiring, and script simplification.
- Planned child specs:
  - Template source extraction.
  - Bootstrap template-source wiring.
  - Script purpose and duplication cleanup.

## 5) Acceptance

- `src/project-template/` exists and contains the complete downstream baseline.
- Bootstrap full and partial paths copy from `src/project-template/`.
- Tests prove history/caches are not exported.
- Script cleanup produces fewer duplicated code paths without changing public CLI
  behavior.
- Verification includes `make lint`, focused bootstrap/runtime tests, and a
  dry-run bootstrap into a temporary target.

---

*Spec: `docs/arc/SPECS/260413_1250_project-template-source-separation_spec_01.md`*
