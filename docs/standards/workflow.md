---
doc_type: standard
id: 000000_000000_workflow-standard_standard_01
status: active
created_at: 2026-02-23 00:00:00+00:00
updated_at: '2026-05-28T18:29:58Z'
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

Create or update the roadmap feature in `.afol/adm/roadmap/GENERAL-ROADMAP.md`

- Every meaningful feature must have a roadmap entry
- The roadmap is the source of truth for feature inventory and status
- No non-trivial implementation starts before this exists
- A planned feature may be activated with `afol gov af -F <F-id>`; an active
  feature is a no-op and a final feature is never reopened. An active residual
  child spec may govern work under its final parent.

#### Step 2: Parent Spec

Create or update the governing feature spec in `.afol/adm/specs/`

- Define feature intent, user journey, constraints, and acceptance
- Keep implementation detail out of the spec
- Use child specs when decomposition improves clarity or coordination
- Local workstreams may choose `spec` or `spec-child` after the parent spec exists.
- Use `spec-child` for new child/local specs.
- Keep `spec-lite` as a historical compatibility alias, not the default for
  new work.
- Test-focused workstreams should link a `spec-test` strategy artifact before implementing or changing tests
- Keep current-state evidence in `.afol/pstr/` when needed, and keep desired-state intent in roadmap/spec/ADR/architecture docs outside that folder

#### Step 3: Plan

Create a plan file using `docs/templates/plan.md` only when the work actually needs an execution plan

- `plan + task` is the core tracked-work pair for substantial execution
- Link the plan to `roadmap_feature` and `parent_spec`
- Treat the plan as an ExecPlan: a living execution document, not a static memo
- Follow `PLANS.md` from the repo root when authoring or updating the plan
- Use the plan to organize delivery, not to invent feature philosophy
- The plan must describe direct execution steps for the requested objective
- Do not add steps whose only purpose is to make another plan, gather broad
  context, or do generic research
- Keep progress, discoveries, decisions, outcomes, and validation current while work proceeds
- Do not create `brainstorm`, `research`, `explorer-check`, or `postmortem` artifacts automatically
- If optional artifacts are created, they must be marked `final` before session closure
- Do not create a plan only to justify creating another plan or to wrap a pure research-only request
- Do not add phases whose only purpose is broad research, context gathering, or
  creating a later plan; do needed discovery before the plan and fold findings
  into facts, assumptions, risks, scope, sequencing, and validation

#### Step 4: Tasks

Create task files using `docs/templates/task.md` only when there is executable work to track

- One task per logical unit
- Each task must be executable now; tasks that only create the plan or do broad research are not valid
- Track execution state
- Keep task work aligned to the approved roadmap/spec context
- The task file is the required partner to the plan file for non-trivial work
- If work is deferred, mark it `moved` and record the destination + reason instead of using a generic skip

#### Step 5: Execution + Log

Materialize and update log only after real execution starts or a real decision/blocker exists

- Timestamp each entry (UTC with Z suffix)
- Record decisions and findings
- Update task status
- After each meaningful documentation-sensitive change, update the corresponding strategy and process artifacts in the same session
- Keep this section as the canonical place for execution narrative so agents do not reconstruct work from terminal history alone
- Use `.afol/pstr/` as descriptive input evidence only; do not treat map artifacts as substitutes for roadmap/spec/workbench authority

#### Step 6: Report

Close the session only after there is a real delivered outcome or verified
finding. `afol close` preserves an existing report and deterministically creates
the missing report from `--summary` or durable session state.

- Summarize changes
- Include verification evidence
- Document lessons learned
- Include a documentation-drift check and the files updated to keep the scaffold documentation current
- If runtime guidance changed, include runtime contract sync status (`AGENTS.md`
  as canonical, adapter config, and any enabled runtime mirrors).
- List any optional artifacts that were created for the workstream and whether each one is `final`
- Prefer `afol c -m "<summary>"` when the active session is unambiguous.
- Use `--allow-no-report --reason "<reason>"` only for an explicit exception;
  `--summary` cannot be combined with that waiver. A closed legacy session with
  neither report nor persisted waiver is `missing`, not `waived`.
- Treat `verify-tasks <session> --strict` as raw session evidence integrity.
  Historical debt is not passed by that command. When a versioned legacy
  baseline admits an exact pre-contract issue, `afol validate project` reports
  it as waived debt while still blocking unlisted or changed evidence. A
  release-ready claim additionally requires current clean-checkout build, test,
  security, checksum, and provenance evidence.

#### Step 7: Postmortem (Optional but Recommended)

Create postmortem using `docs/templates/postmortem.md` when a closure analysis would add value

- Document what worked and what didn't
- Identify lessons for future work
- Inventory optional artifacts created in the workstream and state whether each one was finalized
- Capture actionable improvements

### Quick changes

For trivial changes requested by user:

- Prefer reusing the active workstream when the work is already inside an approved roadmap/spec context
- Still perform steps 5 and 6
- Log the change
- Report with verification
- Keep even small plans and tasks executable; quick mode is not a license for planning-only steps

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

- Use `.afol/tmp/` for temporary files that do not yet belong in the durable scaffold structure
- Move durable artifacts out of `.afol/tmp/` once they become real project assets

### File naming

```text
.afol/wb/YYMMDD_HHMM_<theme>/
  ├── YYMMDD_HHMM_<theme>_plan_01.md
  ├── YYMMDD_HHMM_<theme>_task_01.md
  ├── YYMMDD_HHMM_<theme>_task_02.md
  ├── YYMMDD_HHMM_<theme>_log_01.md
  ├── YYMMDD_HHMM_<theme>_report_01.md
  └── YYMMDD_HHMM_<theme>_retrospective_01.md  (optional)
```

---

*Standard: `docs/standards/workflow.md`*
