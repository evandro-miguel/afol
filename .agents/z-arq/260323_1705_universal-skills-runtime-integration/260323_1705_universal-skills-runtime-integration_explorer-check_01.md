---
doc_type: explorer-check
id: 260323_1705_universal-skills-runtime-integration_explorer-check_01
theme: universal-skills-runtime-integration
status: final
owners:
- explorer
created_at: '2026-03-23T17:05:28-03:00'
updated_at: '2026-03-23T17:25:44-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1705_universal-skills-runtime-integration_brainstorm_01
  plan: 260323_1705_universal-skills-runtime-integration_plan_01
---

# Explorer Check: universal-skills-runtime-integration

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/agents.config`
  - `.agents/skills-sync.manifest.json`
  - `.agents/cache/universal-skills/README.md`
- Existing docs inspected:
  - `.agents/a-docs/standards/skills-sync.md`
  - `.agents/a-docs/agentic/agents-skills-sync.md`
  - `AGENTS.md`
- Existing scripts/tools checked:
  - `./.agents/agents skills-sync ...`
  - `make skills-sync`
  - bootstrap flow in `./.agents/agents bootstrap`

## Commands Used
```bash
rg -n "skills-sync|skills_sync|manifest|pool_dir|project_dir|selected_skills" .agents/scripts .agents/agents.config .agents/a-docs
sed -n '1,320p' .agents/scripts/agents-skills-sync.py
sed -n '1,260p' .agents/cache/universal-skills/README.md
sed -n '1,260p' .agents/skills-sync.manifest.json
```

## Findings
- The current scaffold manifest only captures `selected_skills`, `mode`, and `upstream_branch`; it cannot represent a stronger repo/ref/profile contract.
- The upstream universal-skills system already models lockfile installs, runtime apps, profiles, doctor flows, and on-demand skill loading.
- Bootstrap already provisions the skills-sync manifest and invokes skills sync non-fatally, so the integration point is present.

## Contradictions or Drift Found
- Scaffold docs still describe the local manifest as the canonical skills contract, but upstream universal-skills already defines a richer contract that better fits multi-runtime interactive agents.

## Impact on the Plan
- What changed in the plan because of exploration:
  - The plan should treat upstream universal-skills as the backend distribution contract and evolve scaffold `skills-sync` into an adapter, not a parallel product.
- What remains uncertain:
  - The exact migration shape for existing manifests and how much of upstream policy verification should land in phase one.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none before initial execution

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
