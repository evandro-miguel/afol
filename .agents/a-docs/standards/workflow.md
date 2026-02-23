---
type: standard
status: active
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

# Workflow Standards

## Mandatory workflow for non-trivial work

### Step 1: Plan
Create a plan file using `.agents/a-docs/templates/plan-template.md`

- Define objective and scope
- List tasks and approach
- Identify tools and risks

### Step 2: Tasks
Create task files using `.agents/a-docs/templates/task-template.md`

- One task per logical unit
- Define acceptance criteria
- Track status with checkboxes

### Step 3: Execution + Log
Update log as work progresses

- Timestamp each entry (UTC with Z suffix)
- Record decisions and findings
- Update task status

### Step 4: Report
Create report using `.agents/a-docs/templates/report-template.md`

- Summarize changes
- Include verification evidence
- Document lessons learned

## Quick changes

For trivial changes requested by user:

- Still perform steps 3 and 4
- Log the change
- Report with verification

## File naming

```
.agents/wb/YYMMDD_HHMM_<theme>/
  ├── YYMMDD_HHMM_<theme>_plan_01.md
  ├── YYMMDD_HHMM_<theme>_task_01.md
  ├── YYMMDD_HHMM_<theme>_task_02.md
  ├── YYMMDD_HHMM_<theme>_log_01.md
  └── YYMMDD_HHMM_<theme>_report_01.md
```

---
*Standard: `.agents/a-docs/standards/workflow.md`*
