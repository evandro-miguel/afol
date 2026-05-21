---
doc_type: explorer-check
id: YYMMDD_HHMM_<theme>_explorer-check_01
theme: <theme>
status: draft
owners:
- explorer
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-04-04T10:08:11-03:00'
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
child_spec: <child_spec_id_or_empty>
links:
  roadmap: <roadmap_path>
  brainstorm: <brainstorm_doc_id>
  plan: <plan_doc_id>
output_artifacts:
  primary:
    explorer_check: YYMMDD_HHMM_<theme>_explorer-check_01
  links:
    roadmap: <roadmap_path>
    plan: <plan_doc_id>
    brainstorm: <brainstorm_doc_id>
  sidecar_justification: <required|not_required>
---

# Explorer Check: <theme>

## Goal

- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed

- Paths inspected:
  - <path>
- Existing docs inspected:
  - <path>
- Existing scripts/tools checked:
  - <path>

## Commands Used

```bash
<command>
```

## Findings

- <finding 1>
- <finding 2>

## Contradictions or Drift Found

- <doc/code mismatch or none>

## Impact on the Plan

- What changed in the plan because of exploration:
  - <change>
- What remains uncertain:
  - <unknown>

## Readiness

- Plan grounded in current repo state: <yes/no>
- Additional exploration still required:
  - <item or none>

## Output Artifact Contract

- If this sidecar exists, record `sidecar_justification` as `required`.
- If not required, set `sidecar_justification` to `not_required` and keep the
  field explicit.

## Sidecar Justification

- Blocking question: <question this sidecar must answer>
- Decision produced: <decision or N/A until answered>
- Execution task affected: <T-XX>
- Stop condition: <what makes this sidecar complete>

---

*Template: `docs/templates/explorer-check.md`*
