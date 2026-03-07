---
doc_type: standard
id: "000000_000000_workflow-standard_standard_01"
status: active
created_at: 2026-02-23T00:00:00Z
updated_at: 2026-02-23T00:00:00Z
title: "Workflow Standards"
---

# Workflow Standards

## Mandatory workflow for non-trivial work

### Step 1: Roadmap
Create or update the roadmap feature in `.agents/arc/GENERAL-ROADMAP.md`

- Every meaningful feature must have a roadmap entry
- The roadmap is the source of truth for feature inventory and status
- No non-trivial implementation starts before this exists

### Step 2: Parent Spec
Create or update the governing feature spec in `.agents/arc/SPECS/`

- Define feature intent, user journey, constraints, and acceptance
- Keep implementation detail out of the spec
- Use child specs when decomposition improves clarity or coordination
- Local workstreams may choose `spec` or `spec-lite` as needed after the parent spec exists

### Step 3: Plan
Create a plan file using `.agents/a-docs/templates/plan.md`

- Link the plan to `roadmap_feature` and `parent_spec`
- Use the plan to organize delivery, not to invent feature philosophy
- Identify tools, risks, and verification

### Step 4: Tasks
Create task files using `.agents/a-docs/templates/task.md`

- One task per logical unit
- Track execution state
- Keep task work aligned to the approved roadmap/spec context

### Step 5: Execution + Log
Update log as work progresses

- Timestamp each entry (UTC with Z suffix)
- Record decisions and findings
- Update task status
- After each meaningful documentation-sensitive change, update the corresponding strategy and process artifacts in the same session
- Keep this section as the canonical place for execution narrative so agents do not reconstruct work from terminal history alone

### Step 6: Report
Create report using `.agents/a-docs/templates/report.md`

- Summarize changes
- Include verification evidence
- Document lessons learned
- Include a documentation-drift check and the files updated to keep the scaffold documentation current
- If runtime guidance changed, include a mirror sync status (`AGENTS.md` -> `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, `GEMINI.md`)

### Step 7: Retrospective (Optional but Recommended)
Create retrospective using `.agents/a-docs/templates/retrospective.md`

- Document what worked and what didn't
- Identify lessons for future work
- Capture actionable improvements

## Quick changes

For trivial changes requested by user:

- Prefer reusing the active workstream when the work is already inside an approved roadmap/spec context
- Still perform steps 5 and 6
- Log the change
- Report with verification

For a new non-trivial feature:

- Quick mode is not enough
- Create or update roadmap + parent spec first
- Then create the workstream

### Documentation-First Completion Rule

- No task is complete until documentation is current.
- Documentation artifacts include, at minimum:
  - command behavior changed → command docs updated (`README.md`, `workbench`, templates)
  - schema/validation changed → standards and workflow docs updated
  - process/policy changed → roadmap/spec/operational standards updated
  - runtime adapter changed → runtime-facing mirrors updated

## Temporary files

- Use `.agents/tmp/` for temporary files that do not yet belong in the durable scaffold structure
- Move durable artifacts out of `.agents/tmp/` once they become real project assets

## File naming

```
.agents/wb/YYMMDD_HHMM_<theme>/
  ├── YYMMDD_HHMM_<theme>_plan_01.md
  ├── YYMMDD_HHMM_<theme>_task_01.md
  ├── YYMMDD_HHMM_<theme>_task_02.md
  ├── YYMMDD_HHMM_<theme>_log_01.md
  ├── YYMMDD_HHMM_<theme>_report_01.md
  └── YYMMDD_HHMM_<theme>_retrospective_01.md  (optional)
```

---
*Standard: `.agents/a-docs/standards/workflow.md`*
