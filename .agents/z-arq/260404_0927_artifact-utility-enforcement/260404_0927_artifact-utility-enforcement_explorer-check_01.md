---
doc_type: explorer-check
id: 260404_0927_artifact-utility-enforcement_explorer-check_01
theme: artifact-utility-enforcement
status: final
owners:
- explorer
workstream_intent: delivery
artifact_purpose: Prove the workstream plan is grounded in the current repo behavior
  rather than assumptions.
created_at: '2026-04-04T09:27:02-03:00'
updated_at: '2026-04-04T10:07:34-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  brainstorm: 260404_0927_artifact-utility-enforcement_brainstorm_01
  plan: 260404_0927_artifact-utility-enforcement_plan_01
---

# Explorer Check: artifact-utility-enforcement

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/lib/workflow_manifest.py`
  - `.agents/scripts/lib/execution_commands.py`
  - `.agents/scripts/verify-tasks.py`
- Existing docs inspected:
  - `docs/agentic/agents-new.md`
  - `docs/agentic/agents-config.md`
  - `docs/standards/agents-usage.md`
  - `docs/standards/scripts-usage.md`
  - `docs/standards/workflow.md`
- Existing scripts/tools checked:
  - `./.agents/agents new`
  - `./.agents/agents status`
  - `./.agents/agents session catchup`
  - `make new`

## Commands Used
```bash
rg -n "artifact_manifest|workflow_artifact_states|draft|brainstorm|spec-lite|plan-only|quick" .agents/scripts .agents/agents.config docs/agentic docs/standards README.md -S
sed -n '1,260p' .agents/scripts/lib/workflow_manifest.py
sed -n '1,260p' .agents/scripts/lib/execution_commands.py
sed -n '260,760p' .agents/scripts/agents-new.py
sed -n '1,220p' docs/templates/brainstorm.md
```

## Findings
- The previous default still created brainstorm/research/explorer-check/log/report/postmortem even for a normal delivery workstream.
- Quick mode depended on `task` + `log`, which meant log needed lazy materialization once the default creation set became smaller.
- Session catchup and review needed to stop assuming every session is a full delivery package.

## Contradictions or Drift Found
- Docs still described a fixed default sequence even after the manifest extraction work was already done in code.

## Impact on the Plan
- What changed in the plan because of exploration:
  - Add `workflow.artifact_policy` instead of expanding the manifest alone.
  - Add semantic utility checks instead of status-only readiness.
  - Update `docs/standards/Makefile` so `make new` can pass `INTENT` and `WITH`.
- What remains uncertain:
  - Need one final `make all` pass to flush any remaining stale assumptions.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `docs/templates/explorer-check.md`*
