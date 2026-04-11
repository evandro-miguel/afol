---
doc_type: explorer-check
id: 260402_1613_scaffold-ops-skill_explorer-check_01
theme: scaffold-ops-skill
status: final
owners:
- explorer
created_at: '2026-04-02T16:13:52-03:00'
updated_at: '2026-04-02T16:49:35-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1613_scaffold-ops-skill_brainstorm_01
  plan: 260402_1613_scaffold-ops-skill_plan_01
---

# Explorer Check: scaffold-ops-skill

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/test_agents_skills_sync.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `.agents/skills/agentic-system-workflow/`
  - `.agents/skills-sync.manifest.json`
- Existing docs inspected:
  - `README.md`
  - `.agents/a-docs/standards/skills-sync.md`
  - `.agents/a-docs/standards/bootstrap-other-repo.md`
- Existing scripts/tools checked:
  - `./.agents/agents skills-sync status`
  - `./.agents/agents skills-sync check`
  - `bun .agents/skills/writing-skills/scripts/check-universal-skills-sync.js`

## Commands Used
```bash
rg -n "skills-sync|bootstrap|source_dir|default_skills" .agents/scripts .agents/skills README.md
uv run --project .agents/scripts pytest .agents/scripts/tests/test_agents_skills_sync.py -q
./.agents/agents skills-sync status
./.agents/agents skills-sync check
```

## Findings
- The committed local source seed had profile files that referenced skills not
  actually present under `.agents/source/universal-skills/skills/`.
- `skills-sync list` / `search` and plain `ensure` could miss the full git
  catalog because they followed the active local source too literally.
- Full bootstrap still required the target directory to already exist.

## Contradictions or Drift Found
- The docs already positioned the scaffold as easy to adopt, but the runtime
  still made a fresh bootstrap path fail when the target directory was missing.
- `default_skills` in config implied `agentic-system-workflow` was default, but
  the default manifest logic installed only the upstream `core` profile.

## Impact on the Plan
- What changed in the plan because of exploration:
  - Add runtime fixes, not just docs, for catalog discovery, ensure fallback,
    local-source validity, and bootstrap target creation.
- What remains uncertain:
  - Whether a later round still wants a dedicated `init-project` wrapper.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
