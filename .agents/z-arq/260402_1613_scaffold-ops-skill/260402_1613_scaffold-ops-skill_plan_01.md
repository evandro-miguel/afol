---
doc_type: plan
id: 260402_1613_scaffold-ops-skill_plan_01
theme: scaffold-ops-skill
status: final
owners:
- orchestrator
created_at: 2026-04-02 16:13:52-03:00
updated_at: '2026-04-02T16:49:35-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1613_scaffold-ops-skill_brainstorm_01
  explorer_check: 260402_1613_scaffold-ops-skill_explorer-check_01
  research: 260402_1613_scaffold-ops-skill_research_01
  task: 260402_1613_scaffold-ops-skill_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: scaffold-ops-skill

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Make the scaffold easy for agents to operate through one local skill while
  keeping the repo sandboxed, self-contained, and git-manageable for skills.
- An operator should be able to bootstrap a repo, discover skills from the
  git-backed catalog when available, ensure/install missing skills cleanly, and
  keep the repo-local source seed internally consistent.

## Progress
- [x] 2026-04-02 16:20-03:00 - Updated `agentic-system-workflow` and scaffold docs to make the operational skill canonical.
- [x] 2026-04-02 16:34-03:00 - Fixed `skills-sync` tests after hardening repo-local source validation.
- [x] 2026-04-02 16:55-03:00 - Added catalog-aware discovery and ensure fallback to an existing git mirror.
- [x] 2026-04-02 17:12-03:00 - Fixed local source metadata generation so seed profiles/index stay consistent with mirrored skills.
- [x] 2026-04-02 17:28-03:00 - Made full bootstrap create a missing target directory and updated docs.
- [x] 2026-04-02 17:40-03:00 - Passed final validation with `make all`, `skills-sync check`, and strict skill guard checks.

## Surprises & Discoveries
- Observation: the repo-local source seed could look valid while its profiles
  referenced skills that were not actually present.
  Evidence: `./.agents/agents skills-sync check` reported missing source skills
  until the local source was regenerated.
- Observation: discovery commands were biased toward the local seed, which hid
  the full git-backed catalog even when a mirror already existed.
  Evidence: local review of `source_repo_path()` plus RAG hits on
  `cmd_list`, `cmd_search`, and `active_source_repo_path`.

## Decision Log
- Decision: keep local-first install/apply behavior, but let discovery and
  on-demand ensure prefer an existing git-backed catalog.
  Rationale: this preserves sandboxed bootstrap semantics while making the
  system practical for agents who need to discover or fetch more skills later.
  Date/Author: 2026-04-02 / Codex
- Decision: treat a local source as valid only when its profile files reference
  skills that actually exist under `skills/`.
  Rationale: a self-contained scaffold cannot advertise profile contracts it
  cannot satisfy locally.
  Date/Author: 2026-04-02 / Codex
- Decision: full bootstrap should create a missing target directory.
  Rationale: this removes a friction point without changing the safety contract
  of `--partial`.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective
- Outcome: the scaffold now has a clearer operating skill, consistent local
  source metadata, catalog-aware skill discovery, safer ensure behavior, and
  easier full bootstrap.
- Remaining: a future round can still add a first-class `init-project` or
  `upgrade-framework` command if we want an even thinner UX layer.
- Lesson: repo-local source seeds need their own integrity rules; copying
  upstream metadata blindly into a subset source breaks the contract.

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260402_1613_scaffold-ops-skill_brainstorm_01`
- Explorer check artifact: `260402_1613_scaffold-ops-skill_explorer-check_01`
- Research artifact: `260402_1613_scaffold-ops-skill_research_01`
- Knowledge lookup performed:
  - Reviewed prior F-10 sessions under `.agents/wb/260402_1320_repo-sandbox-integrity`
    and `.agents/wb/260402_1505_skills-sync-git-publish`.

## Context and Orientation
- `.agents/scripts/agents-skills-sync.py` is the runtime surface for listing,
  searching, syncing, ensuring, checking, and publishing project-local skills.
- `.agents/scripts/agents-bootstrap.py` provisions this scaffold into another
  repository and seeds `.agents/source/universal-skills`.
- `.agents/skills/agentic-system-workflow/` is the operator-facing skill for
  install, upgrade, validation, and governed workbench usage of the scaffold.
- `.agents/source/universal-skills` is the repo-local seed; `.agents/cache/universal-skills`
  is the git-backed mirror/catalog when present.
- The critical contract is: local bootstrap must stay self-contained, but agents
  should still be able to discover and fetch more skills through git when needed.

## Scope
- In scope:
  - Canonicalize the operational skill and its docs.
  - Fix local-source validation, metadata generation, and default manifest behavior.
  - Fix discovery and ensure behavior around local seed vs git catalog.
  - Remove the full-bootstrap requirement that the target directory already exist.
  - Validate with focused tests, skill guards, and the full repo gate.
- Out of scope:
  - Creating a brand-new plugin package or marketplace entry.
  - Adding branch/PR workflow helpers for `skills-sync push`.

## Plan of Work
- Update the operational skill docs first so the user-facing contract is clear.
- Harden `agents-skills-sync.py` around local-source validity, catalog source
  selection, and default manifest semantics.
- Align the focused tests with the stricter contract and add regression tests
  for catalog discovery, ensure fallback, and bootstrap target creation.
- Reseed the committed local source from the git mirror so the repo carries a
  valid subset source.
- Finish by updating the docs that describe bootstrap and skills-sync behavior,
  then rerun the repository gate.

## Concrete Steps
1. Edit `.agents/skills/agentic-system-workflow/*`, `README.md`, and the
   canonical `skills-sync` docs to expose the intended workflow.
2. Edit `.agents/scripts/agents-skills-sync.py` and
   `.agents/scripts/agents-bootstrap.py` for contract fixes.
3. Extend `.agents/scripts/tests/test_agents_skills_sync.py` and
   `.agents/scripts/tests/test_runtime_compatibility.py`.
4. Reseed `.agents/source/universal-skills` from the git mirror with the
   corrected metadata logic.
5. Validate with focused pytest commands, `skills-sync check`, the skill guard,
   and `make all`.

## Interfaces and Dependencies
- Tools:
  - `uv`
  - `make`
  - `bun`
  - `rg`
- MCPs:
  - `rag-docs`
- Skills:
  - `workbench-agent-teams`
  - `writing-skills`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/skills/agentic-system-workflow/SKILL.md`
  - `.agents/skills-sync.manifest.json`
  - `.agents/source/universal-skills/`

## Risks and Mitigations
- Risk: fixing source validation could break older tests that built partial
  fake sources -> Mitigation: update fixtures to seed valid `skills/`,
  `profiles/`, and `index.json`.
- Risk: local source and git mirror could drift again after doc edits ->
  Mitigation: republish the changed skill and rerun the local guard script.

## Validation and Acceptance
- Unit: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_agents_skills_sync.py -q`
- E2E: `N/A`
- Typecheck: `N/A`
- Lint: `make all`
- Behavioral acceptance:
  - `./.agents/agents skills-sync check` must pass without missing-source or drift warnings.
  - `bun .agents/skills/writing-skills/scripts/check-universal-skills-sync.js --skill agentic-system-workflow,writing-skills` must pass.
  - `make all` must finish with the final banner `All validations passed`.

## Idempotence and Recovery
- Focused pytest commands, `skills-sync check`, the skill guard, and `make all`
  are safe to re-run.
- If the local source becomes inconsistent again, rerun the reseed helper or
  `skills-sync push` / `skills-sync sync` with the corrected metadata logic.

## Artifacts and Notes
- RAG evidence: project `agentic-start-folder-agents`
  (`md79tkzg41xw37q83es5vak5td842k2w`) highlighted `source_repo_path`,
  `cmd_list`, `cmd_search`, `validate_target`, and local seed helpers as the
  hot surfaces for remaining debt.
- Final proof set:
  - `./.agents/agents skills-sync check` -> `PASS: skills structure and sync are valid`
  - `bun .agents/skills/writing-skills/scripts/check-universal-skills-sync.js --skill agentic-system-workflow,writing-skills` -> `STATUS: PASS`
  - `make all` -> `164 passed` and final success banner

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
