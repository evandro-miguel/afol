---
doc_type: explorer-check
id: 260323_1827_universal-skills-local-source-and-discovery_explorer-check_01
theme: universal-skills-local-source-and-discovery
status: final
owners:
- explorer
created_at: '2026-03-23T18:27:53-03:00'
updated_at: '2026-03-23T19:07:53-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1827_universal-skills-local-source-and-discovery_brainstorm_01
  plan: 260323_1827_universal-skills-local-source-and-discovery_plan_01
---

# Explorer Check: universal-skills-local-source-and-discovery

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/tests/test_agents_skills_sync.py`
  - `.agents/agents.config`
  - `.agents/skills-sync.manifest.json`
  - `.agents/skills/`
  - `.agents/cache/universal-skills/`
  - `/home/ozy/.codex/skills/`
  - `/home/ozy/apps/universal-skills/`
- Existing docs inspected:
  - `.agents/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md`
  - `.agents/a-docs/agentic/agents-skills-sync.md`
  - `.agents/a-docs/standards/skills-sync.md`
- Existing scripts/tools checked:
  - `./.agents/agents skills-sync status`
  - `./.agents/agents skills-sync plan --runtime codex`
  - `./.agents/agents skills-sync check --runtime codex`

## Commands Used
```bash
./.agents/agents knowledge search "universal skills integration local clone search ensure"
./.agents/agents skills-sync status
./.agents/agents skills-sync plan --runtime codex
./.agents/agents skills-sync check --runtime codex
ls -la /home/ozy/.codex/skills
git clone https://github.com/evandro-miguel/skill-universal.git /home/ozy/apps/universal-skills
```

## Findings
- The current manifest already uses `version: 2` with `repo/ref/mode/installs/profile`, but the CLI only exposes `init/pull/status/plan/apply/check/sync`.
- `status` can count available skills in the source pool, but there is no first-class `list`, `search`, or `ensure` subcommand for operators.
- The project currently resolves skills from `.agents/cache/universal-skills`, while a full upstream checkout can live cleanly at `/home/ozy/apps/universal-skills`.
- The global Codex skills directory currently contains many skill folders that overlap with the upstream universal-skills repo.

## Contradictions or Drift Found
- Docs still describe `.agents/cache/universal-skills` as the default mirror/source, but the requested operating model is a sibling checkout under `apps/`.
- The `F-10` first slice report claimed a stronger contract landed, but discovery/on-demand install is still missing.

## Impact on the Plan
- What changed in the plan because of exploration:
  - The implementation should prefer a sibling checkout while keeping the cache path only as a compatibility fallback.
  - The work should include archival removal of overlapping global Codex skills instead of just ignoring them.
- What remains uncertain:
  - Which global Codex skill folders are custom and should not be moved.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
