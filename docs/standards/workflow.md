---
doc_type: standard
id: 000000_000000_workflow-standard_standard_01
status: active
created_at: 2026-02-23 00:00:00+00:00
updated_at: '2026-04-19T18:34:47-03:00'
title: Workflow Standards
---

## Workflow Standards

### Mandatory workflow for non-trivial work

#### Step 0: Decision Intake

For ambiguous, product-shaped, benchmark-heavy, or prioritization-heavy work,
run the smallest useful decision-intake lane before benchmark, planning,
delegation, or implementation.

- Frame the user, behavior evidence, observable outcome, constraints,
  non-goals, reversibility, and first-slice appetite.
- Treat intake as a ladder, not a mandatory pipeline; keep the fast lane
  conversational when the user wants speed.
- Run a challenge checkpoint with critical assumption, rival hypothesis,
  pre-mortem failure mode, simpler alternative, and scope cut.
- Benchmark only after the frame and first solution hypothesis exist.
- Prioritize qualitatively by default; ask before formal scoring when the user
  wants speed.
- If formal scoring is used, separate importance, sequence, and friction with
  evidence notes.
- Cut fixed-appetite vertical slices before expanding scope.
- Use `docs/standards/decision-intake.md` for the full contract.

#### Step 1: Roadmap

Create or update the roadmap feature in `docs/arc/GENERAL-ROADMAP.md`

- Every meaningful feature must have a roadmap entry
- The roadmap is the source of truth for feature inventory and status
- No non-trivial implementation starts before this exists

#### Step 2: Parent Spec

Create or update the governing feature spec in `docs/arc/SPECS/`

- Define feature intent, user journey, constraints, and acceptance
- Keep implementation detail out of the spec
- Use child specs when decomposition improves clarity or coordination
- Local workstreams may choose `spec` or `spec-child` as needed after the parent spec exists
- Keep `spec-lite` as a historical compatibility alias while migration remains in progress
- Test-focused workstreams should link a `spec-test` strategy artifact before implementing or changing tests
- Keep current-state evidence in `docs/map/` when needed, and keep desired-state intent in roadmap/spec/ADR/architecture docs outside that folder

#### Step 3: Plan

Create a plan file using `docs/templates/plan.md` only when the work actually needs an execution plan

- Link the plan to `roadmap_feature` and `parent_spec`
- Treat the plan as an ExecPlan: a living execution document, not a static memo
- Follow `PLANS.md` from the repo root when authoring or updating the plan
- Use the plan to organize delivery, not to invent feature philosophy
- Keep progress, discoveries, decisions, outcomes, and validation current while work proceeds
- Do not create a plan only to justify creating another plan or to wrap a pure research-only request

#### Step 4: Tasks

Create task files using `docs/templates/task.md` only when there is executable work to track

- One task per logical unit
- Track execution state
- Keep task work aligned to the approved roadmap/spec context

#### Step 5: Execution + Log

Materialize and update log only after real execution starts or a real decision/blocker exists

- Timestamp each entry (UTC with Z suffix)
- Record decisions and findings
- Update task status
- After each meaningful documentation-sensitive change, update the corresponding strategy and process artifacts in the same session
- Keep this section as the canonical place for execution narrative so agents do not reconstruct work from terminal history alone
- Use `docs/map/` as descriptive input evidence only; do not treat map artifacts as substitutes for roadmap/spec/workbench authority

#### Step 6: Report

Create report using `docs/templates/report.md` only after there is a real delivered outcome or verified finding to summarize

- Summarize changes
- Include verification evidence
- Document lessons learned
- Include a documentation-drift check and the files updated to keep the scaffold documentation current
- If runtime guidance changed, include a mirror sync status (`AGENTS.md` -> `CLAUDE.md`)

#### Step 7: Retrospective (Optional but Recommended)

Create retrospective using `docs/templates/retrospective.md`

- Document what worked and what didn't
- Identify lessons for future work
- Capture actionable improvements

### Quick changes

For trivial changes requested by user:

- Prefer reusing the active workstream when the work is already inside an approved roadmap/spec context
- Still perform steps 5 and 6
- Log the change
- Report with verification

### Artifact Utility Rule

- A workbench artifact may exist only if it has a concrete purpose in the current session.
- Placeholder-only artifacts do not count as valid progress, even if their frontmatter status is `active` or `final`.
- If brainstorming did not happen, do not materialize `brainstorm.md`.
- If the request is only research, do not create `plan.md` or `task.md` unless execution work is actually being staged.

For a new non-trivial feature:

- Quick mode is not enough
- Create or update roadmap + parent spec first
- Then create the workstream

### ExecPlan expectation

- For non-trivial work, the workbench plan file is the canonical ExecPlan for that session.
- It must be self-contained enough that a new contributor can resume from the plan and repo alone.
- Finalized plans must keep the required living sections and a checkbox-based progress trail.

#### Documentation-First Completion Rule

- No task is complete until documentation is current.
- Documentation artifacts include, at minimum:
  - command behavior changed → command docs updated (`README.md`, `workbench`, templates)
  - schema/validation changed → standards and workflow docs updated
  - process/policy changed → roadmap/spec/operational standards updated
  - runtime adapter changed → runtime-facing mirrors updated

### Temporary files

- Use `.agents/tmp/` for temporary files that do not yet belong in the durable scaffold structure
- Move durable artifacts out of `.agents/tmp/` once they become real project assets

### File naming

```text
.agents/wb/YYMMDD_HHMM_<theme>/
  ├── YYMMDD_HHMM_<theme>_plan_01.md
  ├── YYMMDD_HHMM_<theme>_task_01.md
  ├── YYMMDD_HHMM_<theme>_task_02.md
  ├── YYMMDD_HHMM_<theme>_log_01.md
  ├── YYMMDD_HHMM_<theme>_report_01.md
  └── YYMMDD_HHMM_<theme>_retrospective_01.md  (optional)
```

---

*Standard: `docs/standards/workflow.md`*
