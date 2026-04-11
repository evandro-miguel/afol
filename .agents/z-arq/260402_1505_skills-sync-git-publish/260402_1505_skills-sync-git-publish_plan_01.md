---
doc_type: plan
id: 260402_1505_skills-sync-git-publish_plan_01
theme: skills-sync-git-publish
status: final
owners:
- orchestrator
created_at: 2026-04-02 15:05:32-03:00
updated_at: '2026-04-02T15:21:55-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1505_skills-sync-git-publish_brainstorm_01
  explorer_check: 260402_1505_skills-sync-git-publish_explorer-check_01
  research: 260402_1505_skills-sync-git-publish_research_01
  task: 260402_1505_skills-sync-git-publish_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: skills-sync-git-publish

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Make the skills workflow practical for bootstrapped downstream repos: refresh
  selected skills from git when needed, but keep bootstrap local-first by
  default and allow explicit publication of edited local skills back to the
  universal-skills git source.
- An operator can see the behavior working by running `skills-sync sync` /
  `skills-sync update` to refresh `.agents/skills/`, and `skills-sync push` to
  publish a chosen skill back to the git-backed source checkout.

## Progress
- [x] 2026-04-02 15:08-03:00 - Inspected the current `skills-sync` contract, docs, and tests.
- [x] 2026-04-02 15:14-03:00 - Implemented git-mirror refresh, `update` alias, and `push`.
- [x] 2026-04-02 15:18-03:00 - Updated canonical docs and tool catalog.
- [x] 2026-04-02 15:20-03:00 - Passed `make all`.

## Surprises & Discoveries
- Observation: `sync` already was the correct one-step install verb; the real gap
  was seeded-repo access to git updates plus missing publish support.
  Evidence: local review of `agents-skills-sync.py` and subagent architecture pass.
- Observation: downstream seeded repos needed a git mirror rather than source
  replacement to preserve the local-first bootstrap contract.
  Evidence: current active-source selection prefers `.agents/source/universal-skills`.

## Decision Log
- Decision: preserve `pull` as a source-refresh step and add `update` as an alias to `sync`.
  Rationale: maintain compatibility while exposing clearer user intent.
  Date/Author: 2026-04-02 / Codex
- Decision: add `skills-sync push` with explicit `--commit` and `--push`.
  Rationale: publication to git must be intentional and bounded to selected skills.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective
- Outcome: `skills-sync` now supports git-backed refresh for seeded repos and explicit publication of local skills.
- Remaining: a future round can decide whether broader source-management verbs are worth adding.
- Lesson: when a local-first seed coexists with optional git refresh, a separate mirror path is simpler than redefining the local source contract.

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260402_1505_skills-sync-git-publish_brainstorm_01`
- Explorer check artifact: `260402_1505_skills-sync-git-publish_explorer-check_01`
- Research artifact: `260402_1505_skills-sync-git-publish_research_01`
- Knowledge lookup performed:
  - Reused earlier F-10 sandbox/local-first work as the baseline constraint.

## Context and Orientation
- `.agents/scripts/agents-skills-sync.py` governs how project-local skills under
  `.agents/skills/` are selected, refreshed, and validated against the
  universal-skills source contract.
- `.agents/source/universal-skills` is the preferred local source surface for a repo.
- `.agents/cache/universal-skills` can act as the git-backed mirror when the
  preferred local source is only a bootstrap seed.
- `skills-sync sync` / `update` are the intended one-step update paths for
  `.agents/skills/`.

## Scope
- In scope:
  - Enable seeded downstream repos to refresh selected skills from git.
  - Add a publish path for selected local skills back to the git-backed source.
  - Update the canonical docs and catalog for the new contract.
- Out of scope:
  - Changing bootstrap back to a remote-first flow.
  - Publishing entire skill trees by default.

## Plan of Work
- Extend `agents-skills-sync.py` with a git mirror helper, a safer `push`
  command, and a clearer `update` alias for the existing `sync` flow.
- Add focused tests around seeded-source refresh and publish behavior.
- Update the wrapper-facing docs, Make targets, and catalog entries that define
  the public contract.

## Concrete Steps
1. Edit `.agents/scripts/agents-skills-sync.py` to support git mirror refresh and explicit publish.
2. Add tests in `.agents/scripts/tests/test_agents_skills_sync.py`.
3. Update `README.md`, `AGENTS.md`, `.agents/tools.json`, and the canonical `skills-sync` docs.
4. Run `make all`.

## Interfaces and Dependencies
- Tools:
  - `rg`
  - `uv`
  - `make`
- MCPs:
  - none
- Skills:
  - `workbench-agent-teams`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/agents-skills-sync.py` with `update` and `push` support
  - `make skills-update` and `make skills-push`
  - canonical docs matching the new CLI contract

## Risks and Mitigations
- Risk: changing `pull` semantics too aggressively -> Mitigation: preserve `pull` as source refresh and keep install behavior in `sync/update`.
- Risk: accidental remote mutation -> Mitigation: require explicit `--commit` / `--push`.

## Validation and Acceptance
- Unit: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_agents_skills_sync.py -q`
- E2E: `N/A`
- Typecheck: `N/A`
- Lint: `make all`
- Behavioral acceptance:
  - `skills-sync sync` / `update` can refresh `.agents/skills/` even when the preferred source is a seed and git access goes through a mirror.
  - `skills-sync push` can publish selected local skills to the git-backed source with explicit commit/push.

## Idempotence and Recovery
- `make all` and the focused pytest command are safe to re-run.
- `skills-sync push` without `--commit` / `--push` only updates the source working tree and can be reviewed before publication.

## Artifacts and Notes
- Focused test proof: `15 passed` in `test_agents_skills_sync.py`.
- Repo gate proof: `make all` finished with `158 passed` and `All validations passed`.

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork
