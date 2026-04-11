---
doc_type: plan
id: 260323_1827_universal-skills-local-source-and-discovery_plan_01
theme: universal-skills-local-source-and-discovery
status: final
owners:
- orchestrator
created_at: 2026-03-23 18:27:53-03:00
updated_at: '2026-03-23T19:07:53-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: null
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1827_universal-skills-local-source-and-discovery_brainstorm_01
  explorer_check: 260323_1827_universal-skills-local-source-and-discovery_explorer-check_01
  research: 260323_1827_universal-skills-local-source-and-discovery_research_01
  task: 260323_1827_universal-skills-local-source-and-discovery_task_01
repo: agentic_start_folder
branch: main
---

# Plan: universal-skills-local-source-and-discovery

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Make `skills-sync` usable as a real operator surface for interactive agents by letting them discover available upstream skills, search by keyword, and ensure a missing skill into the local project.
- Move the preferred universal-skills source from global Codex skills or repo-local cache assumptions to a sibling checkout at `../universal-skills`, so this scaffold and nearby repos can share one editable source repo.

## Progress
- [x] 2026-03-23 21:27Z - Created governed workstream under `F-10` and grounded it with repo exploration and a local upstream clone at `/home/ozy/apps/universal-skills`.
- [x] 2026-03-23 21:34Z - Updated `agents-skills-sync.py`, config defaults, Makefile wrappers, tools catalog, and tests for local-source preference plus `list/search/ensure`.
- [x] 2026-03-23 21:36Z - Archived overlapping universal-skills payload out of `/home/ozy/.codex/skills` to `/home/ozy/.codex/skills-archive/20260323_1836_universal-skills-global`.
- [x] 2026-03-23 21:40Z - Updated docs, validated commands/tests, and prepared session closure artifacts.
- [x] 2026-03-23 21:46Z - Applied user correction: removed the archived overlap payload entirely and recorded the prevention lesson.
- [x] 2026-03-23 22:01Z - Extended bootstrap to prepare `../universal-skills` automatically for `apps/` targets and updated governance to favor project-local skills over large global Codex skill sets.

## Surprises & Discoveries
- Observation: `skills-sync` already had enough internal machinery for profile/runtime resolution; the gap is mostly command surface and source selection.
  Evidence: `agents-skills-sync.py` already exposes `available_skills()`, `_resolve_targets()`, and `resolve_skills_for_request()`.
- Observation: the global Codex skills directory appears to contain a large copied subset of universal-skills content.
  Evidence: `/home/ozy/.codex/skills` overlaps with `/home/ozy/apps/universal-skills/skills/*`.

## Decision Log
- Decision: Prefer a sibling local checkout `../universal-skills` as the primary source, while keeping `.agents/cache/universal-skills` as a compatibility fallback.
  Rationale: Matches the requested workflow without breaking older repos that still have the legacy cache clone.
  Date/Author: 2026-03-23 / orchestrator
- Decision: Implement discovery as scaffold-native `skills-sync list/search/ensure` commands instead of telling agents to inspect the upstream repo manually.
  Rationale: Agents need a stable, low-friction project-local interface.
  Date/Author: 2026-03-23 / orchestrator
- Decision: When the user explicitly states overlapping global copies can be removed, do not preserve them in archive by default.
  Rationale: Extra preservation adds clutter and contradicts the requested operational policy.
  Date/Author: 2026-03-23 / orchestrator
- Decision: Bootstrap should prepare the sibling `../universal-skills` checkout explicitly for `apps/` targets.
  Rationale: This keeps the project-local skill workflow available even when post-checks are skipped.
  Date/Author: 2026-03-23 / orchestrator
- Decision: Canonical runtime guidance should explicitly prefer project-local skills over a large global Codex skill inventory.
  Rationale: The repo should carry its own skill contract and keep machine-global state lean.
  Date/Author: 2026-03-23 / orchestrator

## Outcomes & Retrospective
- Outcome: `skills-sync` now prefers a sibling local upstream checkout, exposes `list/search/ensure`, bootstrap prepares the sibling checkout automatically for `apps/` targets, and the governance docs now explicitly prefer project-local skills over a large global Codex skill inventory.
- Remaining: none for this slice.
- Lesson: the first `F-10` slice solved manifest semantics but stopped short of operator discovery UX, and follow-up cleanup should match the user's explicit deletion policy instead of defaulting to archival.

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260323_1827_universal-skills-local-source-and-discovery_brainstorm_01`
- Explorer check artifact: `260323_1827_universal-skills-local-source-and-discovery_explorer-check_01`
- Research artifact: `260323_1827_universal-skills-local-source-and-discovery_research_01`
- Knowledge lookup performed:
  - `./.agents/agents knowledge search "universal skills integration local clone search ensure"` -> no direct reusable match
  - Reviewed prior `F-10` plan/report/postmortem artifacts for the first integration slice

## Context and Orientation
- The scaffold installs project-local skills under `.agents/skills/`. Those are the skills visible to repo-aware agents in this project.
- `universal-skills` is the upstream source repository containing reusable skill definitions under `skills/<name>/SKILL.md`, plus `profiles/*.json`.
- `.agents/scripts/agents-skills-sync.py` is the adapter that pulls from the upstream source and installs project-local copies.
- Today the adapter prefers `.agents/cache/universal-skills`, which works but hides the editable source repo inside the scaffold. The requested model is a sibling checkout at `../universal-skills`.

## Scope
- In scope:
  - Add project-local discovery commands for upstream skills.
  - Prefer sibling checkout source selection while preserving fallback compatibility.
  - Archive overlapping universal-skills payload out of global Codex skills.
  - Update tests and docs to the new contract.
- Out of scope:
  - Rewriting the universal-skills upstream repo itself.
  - Designing per-app custom adapter generation beyond what already exists.
  - Forcing downstream repos to abandon the manifest `version: 2` contract.

## Plan of Work
- Extend `.agents/scripts/agents-skills-sync.py` with source-repo resolution that prefers `../universal-skills`, then add `list`, `search`, and `ensure` subcommands on top of the existing resolver/apply pipeline.
- Update `.agents/agents.config` and the tests in `.agents/scripts/tests/test_agents_skills_sync.py` to cover the new source preference and discovery commands.
- Refresh operator docs in `README.md`, `.agents/scripts/README.md`, `.agents/a-docs/agentic/agents-skills-sync.md`, `.agents/a-docs/standards/skills-sync.md`, `.agents/a-docs/standards/agents-usage.md`, and the Makefile command surface.
- Move overlapping global Codex skill folders into an archive path so the repo no longer depends on those global copies.

## Concrete Steps
1. Patch `.agents/scripts/agents-skills-sync.py`, `.agents/agents.config`, and tests under `.agents/scripts/tests/`.
2. Patch docs and Makefile wrappers for `skills-list`, `skills-search`, and `skills-ensure`.
3. Move overlapping `/home/ozy/.codex/skills/<name>` folders into an archive folder outside the active global skills path.
4. Run targeted `pytest`, `make lint-scripts`, `make test-scripts`, `make lint`, and live `skills-sync` commands against the local source checkout.

## Interfaces and Dependencies
- Tools:
  - `./.agents/agents skills-sync ...`
  - `make skills-*`
- MCPs:
  - none
- Skills:
  - `agentic-system-workflow`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/agents-skills-sync.py` with `list/search/ensure`
  - `.agents/agents.config` with preferred sibling source config
  - `/home/ozy/apps/universal-skills` as active upstream checkout
  - `/home/ozy/.codex/skills` without overlapping universal-skills payload

## Risks and Mitigations
- Risk: removing global skills may affect non-overlapping custom skills -> Mitigation: move only names that exist in `/home/ozy/apps/universal-skills/skills` and archive instead of delete.
- Risk: older repos still rely on `.agents/cache/universal-skills` -> Mitigation: keep it as fallback and document the new preferred source.

## Validation and Acceptance
- Unit: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_skills_sync.py -q`
- E2E: `./.agents/agents skills-sync list --runtime codex`, `./.agents/agents skills-sync search markdown --runtime codex`, `./.agents/agents skills-sync ensure writing-skills --runtime codex`
- Typecheck: N/A
- Lint: `make lint-scripts` and `make lint`
- Behavioral acceptance:
  - `status` reports the sibling checkout as active source.
  - `list` shows upstream skills from the local checkout.
  - `search` returns keyword-matching skills.
  - `ensure` leaves the requested skill installed under `.agents/skills/<name>/SKILL.md`.
  - Overlapping global Codex skills no longer remain in `/home/ozy/.codex/skills`.

## Idempotence and Recovery
- State which steps are safe to re-run.
- If a step can fail halfway, document how to retry or recover cleanly.

## Artifacts and Notes
- Session folder: `.agents/wb/260323_1827_universal-skills-local-source-and-discovery/`
- Local upstream checkout: `/home/ozy/apps/universal-skills`
- Global Codex overlap archive path was removed after user clarification; no residual archive is kept for the overlapping universal-skills payload.

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
