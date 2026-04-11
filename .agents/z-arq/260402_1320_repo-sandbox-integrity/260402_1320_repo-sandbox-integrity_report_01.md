---
doc_type: report
id: 260402_1320_repo-sandbox-integrity_report_01
theme: repo-sandbox-integrity
status: active
created_at: '2026-04-02T13:20:08-03:00'
updated_at: '2026-04-02T14:44:31-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
- T-04
- T-05
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1320_repo-sandbox-integrity_plan_01
  task: 260402_1320_repo-sandbox-integrity_task_01
  postmortem: ''
---

# Report: repo-sandbox-integrity

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``

## Summary
- Hardened the scaffold so downstream repos bootstrap into a repo-local sandbox with truthful validation and no default external file pulls for universal-skills.

## Delivered Changes
- Hardened validation semantics so the aggregate gate includes integration coverage and the integration harness runs against isolated temporary repos instead of the canonical workbench.
- Made bootstrap local-first by seeding `.agents/source/universal-skills` from committed repo assets and failing fast instead of silently cloning external skill files.
- Updated `skills-sync` so repo-local seeded sources satisfy `pull|sync` without requiring git metadata or network access.
- Hardened repo-map generation and validation so the generated map is scaffold-aware and rejects degenerate outputs.
- Updated operator-facing docs to describe the local-first source contract and downstream validation path.
- Updated the remaining template and command-reference wording so `skills-pull` and the repo-local source contract are described consistently.

## Files Changed
- Bootstrap and skills source/runtime contract:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/agents.config`
  - `.agents/skills-sync.manifest.json`
- Validation and integration isolation:
  - `.agents/a-docs/standards/Makefile`
  - `.github/workflows/agents-scaffold-ci.yml`
  - `.agents/scripts/tests/integration/test_critical_workflows.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `.agents/scripts/tests/test_agents_skills_sync.py`
  - `.agents/scripts/tests/conftest.py`
- Repo-map and path robustness:
  - `.agents/scripts/agents-repo-map.py`
  - `.agents/scripts/tests/test_agents_repo_map.py`
  - `.agents/scripts/agents-knowledge.py`
  - `.agents/scripts/agents-wb-update.py`
- Documentation and runtime mirrors:
  - `README.md`
  - `AGENTS.md`
  - `OPENCODE.md`
  - `QWEN.md`
  - `CLAUDE.md`
  - `GEMINI.md`
  - `.agents/scripts/README.md`
  - `.agents/a-docs/standards/bootstrap-other-repo.md`
  - `.agents/a-docs/standards/skills-sync.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/a-docs/standards/scripts-reference.md`
  - `.agents/templates/AGENTS_TEMPLATE.md`
  - `.agents/a-docs/agentic/agents-bootstrap.md`
  - `.agents/a-docs/agentic/agents-skills-sync.md`
- Governance/session artifacts:
  - `.agents/wb/.active_session`
  - `.agents/wb/260402_1320_repo-sandbox-integrity/*`

## Verification
- Unit tests: pass -> Evidence: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_runtime_compatibility.py .agents/scripts/tests/test_agents_skills_sync.py`
- Integration and aggregate suite: pass -> Evidence: `make all` in the canonical repo completed with 154 tests green.
- Downstream bootstrap proof: pass -> Evidence: `./.agents/agents bootstrap <tmp-target>` seeded `.agents/source/universal-skills` locally, `PATH=/usr/bin:/bin <tmp-target>/.agents/agents doctor` passed, and `make -C <tmp-target> agents-all` passed with 154 tests green.
- Lint: pass -> Evidence: included in both canonical `make all` and downstream `agents-all`.
- Additional checks:
  - repo-map regeneration -> pass -> Evidence: current `.agents/arc/map/` was regenerated through the scaffold-aware shadow runner and semantic validation gates.
  - wrapper local-venv proof -> pass -> Evidence: downstream `doctor` succeeded with `PATH=/usr/bin:/bin`, proving the target wrapper can use its local venv after bootstrap setup.
  - multi-agent analysis -> pass -> Evidence: specialist agents validated the local-source contract and test-matrix gaps before implementation.

## Risks / Follow-ups
- `skills-sync init|pull` still support remote refresh when a repo intentionally manages a git-backed source checkout; that remains an allowed explicit upgrade path rather than the default bootstrap path.
- The repo map remains generated output and may still need future quality tuning, but the current gates now reject the degenerate outputs that previously slipped through.

## Postmortem Link
- Postmortem: not created; report remains active until broader roadmap reconciliation is finished

## Lessons (if any)
- Prefer local source seeding over hidden remote bootstrap fallbacks for any scaffold surface that downstream repos must be able to run offline after setup.

---
*Template: `.agents/a-docs/templates/report.md`*
