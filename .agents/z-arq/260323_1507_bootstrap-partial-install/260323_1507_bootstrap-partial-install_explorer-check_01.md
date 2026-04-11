---
doc_type: explorer-check
id: 260323_1507_bootstrap-partial-install_explorer-check_01
theme: bootstrap-partial-install
status: draft
owners:
- explorer
created_at: '2026-03-23T15:07:03-03:00'
updated_at: '2026-03-23T15:24:34-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1507_bootstrap-partial-install_brainstorm_01
  plan: 260323_1507_bootstrap-partial-install_plan_01
---

# Explorer Check: bootstrap-partial-install

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/agents-doctor.py`
  - `.agents/agents.config`
  - `.agents/a-docs/standards/Makefile`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `.agents/scripts/tests/test_agents_doctor_fix.py`
- Existing docs inspected:
  - `.agents/a-docs/agentic/agents-bootstrap.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/a-docs/standards/scripts-reference.md`
  - `.agents/scripts/README.md`
- Existing scripts/tools checked:
  - `./.agents/agents bootstrap`
  - `make bootstrap`
  - `make doctor`
  - `make lint`

## Commands Used
```bash
rg -n "bootstrap|partial|active_session|excluded_path_prefixes" .agents/scripts .agents/a-docs .agents/agents.config
sed -n '1,260p' .agents/scripts/agents-bootstrap.py
sed -n '1,220p' .agents/scripts/agents-doctor.py
sed -n '190,220p' .agents/a-docs/standards/Makefile
./.agents/agents bootstrap <fresh-target>
./.agents/agents bootstrap <existing-target> --partial
```

## Findings
- The repo already had sanitized bootstrap export logic, but partial install still existed mostly as implied behavior instead of an explicit install mode.
- Target validation noise came from three independent causes: synced skill docs in markdown lint, missing `.active_session` in zero-session targets, and generated IDs that did not fully align with the repo naming convention.
- The Make wrapper did not expose a first-class partial-install entrypoint.

## Contradictions or Drift Found
- Docs described existing-repo adoption as a safe behavior, but the CLI examples still defaulted to plain `bootstrap` without showing `--partial`.

## Impact on the Plan
- What changed in the plan because of exploration:
  - Added explicit `--partial` mode instead of leaving the behavior implicit.
  - Included doctor/lint hygiene fixes as part of the same delivery because they were required for a clean post-install target.
- What remains uncertain:
  - None blocking after the real bootstrap validations.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
