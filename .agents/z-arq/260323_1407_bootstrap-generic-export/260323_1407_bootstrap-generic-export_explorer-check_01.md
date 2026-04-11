---
doc_type: explorer-check
id: 260323_1407_bootstrap-generic-export_explorer-check_01
theme: bootstrap-generic-export
status: final
owners:
- explorer
created_at: '2026-03-23T14:07:57-03:00'
updated_at: '2026-03-23T14:18:47-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1407_bootstrap-generic-export_brainstorm_01
  plan: 260323_1407_bootstrap-generic-export_plan_01
---

# Explorer Check: bootstrap-generic-export

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
- Existing docs inspected:
  - `.agents/a-docs/agentic/agents-bootstrap.md`
  - `README.md`
  - `.agents/a-docs/standards/agents-usage.md`
- Existing scripts/tools checked:
  - `.agents/agents`
  - `.agents/scripts/agents-doctor.py`

## Commands Used
```bash
./.agents/agents knowledge pull "bootstrap export generic scaffold"
find .agents/a-docs -maxdepth 3 -type f | sort
find .agents/arc -maxdepth 3 -type f | sort
./.agents/agents bootstrap <tmpdir> --skip-checks
./.agents/agents bootstrap <tmpdir>
```

## Findings
- Bootstrap already kept `.agents/wb/` empty, but copied `.agents/a-docs` and live `arc` artifacts too broadly.
- `.agents/a-docs/knowledge/INDEX.md`, lesson-entry history, telemetry reports, and scaffold specs were leaking into fresh targets.
- A generic roadmap template alone was insufficient because `doctor` requires roadmap features to reference real governing spec files.

## Contradictions or Drift Found
- The old tool doc described bootstrap as copying arc baselines, but the actual desired contract is a sanitized export with generated starter governance docs.

## Impact on the Plan
- What changed in the plan because of exploration:
  - Add generated starter parent specs and aligned specs index so a fresh target passes `doctor`.
  - Add explicit sanitization rules for copied `a-docs` subtrees.
- What remains uncertain:
  - Whether optional skills sync would introduce new lint warnings in target repos. It did not block bootstrap because those warnings are non-fatal.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
