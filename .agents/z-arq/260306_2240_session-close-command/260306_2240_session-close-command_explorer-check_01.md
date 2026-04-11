---
doc_type: explorer-check
id: 260306_2240_session-close-command_explorer-check_01
theme: session-close-command
status: active
owners:
- explorer
created_at: '2026-03-06T22:40:43-03:00'
updated_at: '2026-03-07T18:41:21-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260306_2240_session-close-command_brainstorm_01
  plan: 260306_2240_session-close-command_plan_01
---

# Explorer Check: session-close-command

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/agents`
  - `.agents/scripts/agents-status.py`
  - `.agents/scripts/agents-revert.py`
  - `.agents/scripts/agents-wb-update.py`
  - `.agents/scripts/tests/test_execution_command_flow.py`
  - `.agents/tools.json`
- Existing docs inspected:
  - `README.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/a-docs/standards/scripts-usage.md`
  - `.agents/skills/agentic-system-workflow/references/core/README.md`
- Existing scripts/tools checked:
  - `verify-tasks.py`
  - `agents-new.py`
  - `agents-doctor.py`

## Commands Used
```bash
sed -n '1,240p' .agents/agents
sed -n '1,260p' .agents/scripts/tests/test_execution_command_flow.py
sed -n '/def check_active_session_pointer/,/def /p' .agents/scripts/agents-doctor.py
rg -n "verify-tasks|active_session|status|implement|review|revert" .agents/tools.json README.md .agents/a-docs/standards/
```

## Findings
- Strict verification already encodes the real closure gate; the missing piece is a direct command that runs it and reports pointer behavior.
- Clearing `.active_session` would produce a doctor warning, so the safer default is to retain the pointer unless a replacement session is supplied.
- The wrapper docs and tool catalog need updates when adding a new top-level command.

## Contradictions or Drift Found
- Operator expectation was "session close exists", but the repo only had implicit closure through final artifacts plus verification.

## Impact on the Plan
- What changed in the plan because of exploration:
  - The new command will leave `.active_session` unchanged by default and support explicit `--next-session` repointing.
  - The implementation will be a dedicated `agents-session.py` script rather than an extension of `wb-update`.
- What remains uncertain:
  - none

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
