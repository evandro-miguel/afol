---
doc_type: standard
id: "000000_000000_workflow-standard_standard_01"
status: active
created_at: 2026-02-23T00:00:00Z
updated_at: 2026-02-23T00:00:00Z
title: "Workflow Standards"
---

## Workflow Standards

### Mandatory workflow for non-trivial work

#### Step 1: Plan

Create a plan file using `.agents/a-docs/templates/plan.md`

- Define objective and scope
- List tasks and approach
- Identify tools and risks

#### Step 2: Tasks

Create task files using `.agents/a-docs/templates/task.md`

- One task per logical unit
- Define acceptance criteria
- Track status with checkboxes

#### Step 3: Execution + Log

Update log as work progresses

- Timestamp each entry (UTC with Z suffix)
- Record decisions and findings
- Update task status

#### Step 4: Report

Create report using `.agents/a-docs/templates/report.md`

- Summarize changes
- Include verification evidence
- Document lessons learned

#### Step 5: Retrospective (Optional but Recommended)

Create retrospective using `.agents/a-docs/templates/retrospective.md`

- Document what worked and what didn't
- Identify lessons for future work
- Capture actionable improvements

### Quick changes

For trivial changes requested by user:

- Still perform steps 3 and 4
- Log the change
- Report with verification

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

*Standard: `.agents/a-docs/standards/workflow.md`*
