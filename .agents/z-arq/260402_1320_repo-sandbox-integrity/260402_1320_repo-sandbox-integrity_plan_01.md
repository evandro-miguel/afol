---
doc_type: plan
id: 260402_1320_repo-sandbox-integrity_plan_01
theme: repo-sandbox-integrity
status: active
owners:
- orchestrator
created_at: '2026-04-02T13:20:08-03:00'
updated_at: '2026-04-02T14:34:51-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1320_repo-sandbox-integrity_brainstorm_01
  explorer_check: 260402_1320_repo-sandbox-integrity_explorer-check_01
  research: 260402_1320_repo-sandbox-integrity_research_01
  task: 260402_1320_repo-sandbox-integrity_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: repo-sandbox-integrity

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Make this scaffold behave like a real repo-local sandbox when downstream repositories adopt it.
- After implementation, a downstream repo should be able to bootstrap the scaffold, run its internal workflow commands, and understand exactly which external inputs remain acceptable without guessing where host-state dependencies still exist.

## Progress
- [x] 2026-04-02 13:20 - Consolidated prior workbench history, roadmap/spec state, and local repo evidence into a new governed planning session.
- [x] 2026-04-02 13:20 - Completed brainstorm, explorer-check, research, and a local spec-lite that frame repo-sandbox integrity under `F-10`.
- [x] 2026-04-02 14:05 - Hardened bootstrap and skills-sync so downstream repos seed and reuse a repo-local universal-skills source without network pulls.
- [x] 2026-04-02 14:09 - Added and passed focused runtime/skills-sync tests that prove local-first bootstrap and pull semantics.
- [x] 2026-04-02 14:14 - Passed the canonical `make all` gate and a downstream bootstrap -> wrapper doctor -> `make agents-all` validation run.

## Surprises & Discoveries
- Observation: the wrapper is already substantially hermetic, but the validation stack still relies on `uv run` even after local setup exists.
  Evidence: `.agents/agents` resolves `.agents/scripts/.venv`, while `.agents/a-docs/standards/Makefile` still uses `uv run` for `lint-scripts` and `test-scripts`.
- Observation: `make all` is documented as a full-validation command, but its test leg excludes integration and E2E coverage.
  Evidence: `test-scripts` uses `pytest ... -m "not integration and not e2e"` and `agents-all` delegates to that target.
- Observation: the critical integration harness still mutates the canonical repo and `.active_session` instead of operating on a temporary downstream-shaped repo.
  Evidence: `.agents/scripts/tests/integration/test_critical_workflows.py` resolves `ROOT_DIR` to the repository root and writes through the real wrapper and workbench files.
- Observation: roadmap status still lags behind workbench reports for `F-10` and adjacent current-state documentation work.
  Evidence: multiple `260323_*` reports claim delivery slices, while `GENERAL-ROADMAP.md` still marks `F-10` and `F-11` as planned.
- Observation: the downstream-critical bootstrap gap was narrower than expected once the source-contract was made explicit.
  Evidence: seeding `.agents/source/universal-skills` from committed `.agents/skills/` plus a generated `profiles/core.json` and `index.json` was sufficient for downstream `skills-sync sync` to pass.
- Observation: `skills-sync pull` needed an explicit local-source no-op path even after bootstrap was fixed.
  Evidence: `cmd_sync()` always routes through `cmd_pull()`, so the command would still try git operations unless local seeded sources were treated as complete.

## Decision Log
- Decision: govern this session under `F-10` instead of reopening feature philosophy first.
  Rationale: reproducible downstream runtime/skills/bootstrap behavior is the closest existing open feature, and a local spec-lite captures the stricter sandbox contract.
  Date/Author: 2026-04-02 / orchestrator
- Decision: treat `F-06` and `F-11` as execution constraints rather than co-owning features.
  Rationale: runtime compatibility and current-state-vs-goal-state boundaries must be preserved, but they do not need a second planning tree here.
  Date/Author: 2026-04-02 / orchestrator
- Decision: this session remains planning-only until the user approves execution.
  Rationale: the current request explicitly asks for analysis and a workbench plan, not implementation.
  Date/Author: 2026-04-02 / orchestrator
- Decision: bootstrap must not clone universal-skills as part of the default downstream install path.
  Rationale: the scaffold is intended to behave like a self-contained sandbox, so external file pulls are not acceptable in the normal bootstrap contract.
  Date/Author: 2026-04-02 / orchestrator
- Decision: local seeded sources count as authoritative for `skills-sync pull|sync`.
  Rationale: downstream repos need a stable local-first path, and `sync` internally calls `pull` before `apply`.
  Date/Author: 2026-04-02 / orchestrator

## Outcomes & Retrospective
- Outcome: bootstrap, skills-sync, validation semantics, and integration isolation now align around a local-first downstream sandbox contract.
- Outcome: the canonical repo passed `make all`, and a bootstrapped temporary downstream repo passed bootstrap post-checks, wrapper-only doctor, and `make agents-all`.
- Remaining: roadmap wording can still be reconciled further in future governance cleanup, but the implementation and proof path for this session are complete.
- Lesson: treating the repo-local seed as the primary source contract is simpler and more robust than trying to preserve a hidden remote-first bootstrap path.

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260402_1320_repo-sandbox-integrity_brainstorm_01`
- Explorer check artifact: `260402_1320_repo-sandbox-integrity_explorer-check_01`
- Research artifact: `260402_1320_repo-sandbox-integrity_research_01`
- Knowledge lookup performed:
  - Reviewed `.agents/a-docs/knowledge/INDEX.md` and reused prior workbench reports for wrapper isolation, bootstrap generic export, partial install, and universal-skills integration.
  - Read current repo surfaces directly instead of assuming those earlier reports still matched reality.

## Context and Orientation
- This repository is a scaffold that downstream repos adopt to gain a governed `.agents` workflow system.
- The core runtime entrypoint is `.agents/agents`, which launches Python scripts under `.agents/scripts/`.
- Bootstrap behavior is owned by `.agents/scripts/agents-bootstrap.py`, and the skills source/install contract is owned by `.agents/scripts/agents-skills-sync.py`, `.agents/agents.config`, and `.agents/skills-sync.manifest.json`.
- Validation semantics are centralized in `.agents/a-docs/standards/Makefile`, the root `Makefile`, the CI workflow under `.github/workflows/agents-scaffold-ci.yml`, and the tests under `.agents/scripts/tests/`.
- The workbench and roadmap/spec governance already exist, so this plan must tighten the downstream runtime contract without creating a second governance system.

## Scope
- In scope:
  - audit every remaining host-state dependency that affects normal scaffold behavior after setup
  - harden script validation paths so repo-local setup is the default execution path
  - move critical integration tests to isolated temporary repos and injected active-session pointers
  - decide and implement the intended bootstrap/skills source contract for downstream repos
  - align docs, roadmap state, and reports with the real guarantees
- Out of scope:
  - vendoring arbitrary third-party tooling into the repository
  - redesigning unrelated command families
  - changing the scaffold's CLI-interactive-first product positioning

## Plan of Work
- First, audit the current runtime contract and classify each dependency as repo-local, allowed install-time external, or unacceptable runtime leakage.
- Second, harden the validation stack so internal script lint/test workflows prefer the local venv and so their semantics match the guarantees documented in `README.md`, `AGENTS.md`, and the standards docs.
- Third, isolate the integration harness by moving mutating workflows into temporary downstream-shaped repositories with injected session pointers, instead of exercising the canonical repo workbench.
- Fourth, tighten bootstrap and skills behavior so downstream repos receive a complete local surface, while any remaining external inputs are explicit, optional, and documented as installation-time dependencies.
- Fifth, update roadmap/docs/workbench closure artifacts so feature status, validation semantics, and operator guidance all agree with the implemented contract.

## Concrete Steps
1. Write a dependency and contract inventory for `.agents/agents`, `.agents/a-docs/standards/Makefile`, `.agents/scripts/agents-bootstrap.py`, and `.agents/scripts/agents-skills-sync.py`, marking which paths are acceptable local state versus runtime leakage.
2. Refactor `lint-scripts`, `test-scripts`, and any related helper paths to prefer `.agents/scripts/.venv` directly once the local environment exists.
3. Redesign `.agents/scripts/tests/integration/test_critical_workflows.py` and adjacent helpers to operate on temporary repos and custom `AGENTS_ACTIVE_SESSION_FILE` pointers instead of canonical workbench state.
4. Decide the intended downstream contract for `../universal-skills` and `.agents/cache/universal-skills`, then update bootstrap/skills-sync to reflect that contract explicitly.
5. Strengthen validation semantics by either making `make all` truthful for the promised scope or introducing a stronger companion gate with clear documentation.
6. Update `README.md`, `AGENTS.md`, `.agents/a-docs/standards/*`, and any runtime mirrors so the downstream sandbox contract is explicit and stable.
7. Reconcile roadmap status, report wording, and verification expectations so the governance layer accurately reflects what is delivered and what remains.

## Interfaces and Dependencies
- Tools:
  - `.agents/agents`
  - `.agents/agents bootstrap`
  - `.agents/agents skills-sync`
  - `make lint-scripts`
  - `make test-scripts`
  - `make all`
- MCPs:
  - none required for the implementation itself
- Skills:
  - `workbench-agent-teams`
  - `contemplative-orchestrator`
  - `code-discovery`
- Files and interfaces that must exist at the end:
  - `.agents/agents` with a truthful repo-local runtime contract
  - `.agents/a-docs/standards/Makefile` with accurate validation semantics
  - `.agents/scripts/agents-bootstrap.py` with explicit downstream bootstrap behavior
  - `.agents/scripts/agents-skills-sync.py` with explicit source/install semantics
  - `.agents/scripts/tests/integration/test_critical_workflows.py` or its replacement harness isolated from canonical repo state
  - docs that explain the contract without contradicting the implementation

## Risks and Mitigations
- Risk: breaking current `apps/` workspace expectations for the sibling skills source -> Mitigation: treat source-contract changes as an explicit migration with fallback and docs.
- Risk: making `make all` too slow or too broad for day-to-day use -> Mitigation: decide deliberately between a stronger `all` and a new stronger gate before touching the command surface.
- Risk: widening scope beyond F-10 -> Mitigation: keep the implementation centered on downstream reproducibility, runtime leakage, and truthful validation only.
- Risk: roadmap and workbench drift persists after code changes -> Mitigation: include roadmap/docs parity as a required closure slice, not as optional cleanup.

## Validation and Acceptance
- Unit: `.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_skills_sync.py -q` and related focused script tests
- E2E: bootstrap fresh and partial into temporary repos, then run scaffold validations inside those targets
- Typecheck: `N/A`
- Lint: `make lint && make lint-scripts`
- Behavioral acceptance:
  - A bootstrapped downstream repo can run the scaffold's internal command surface after setup without needing hidden global runtime state.
  - Validation commands explicitly state and prove the intended scope.
  - Critical mutating integration tests no longer touch the canonical repo workbench.
  - Docs name which externals remain allowed installation-time inputs and which runtime dependencies are forbidden.

## Idempotence and Recovery
- Workbench documentation edits are safe to re-run and revise as long as `updated_at` stays automation-driven on future execution passes.
- Validation and bootstrap experiments must run in temporary repos, so failures can be discarded without polluting the canonical repo.
- If the source-contract decision for universal-skills proves too disruptive, keep the current fallback behavior and narrow the first implementation slice to documentation plus validation truthfulness.

## Artifacts and Notes
- Prior sessions most relevant to reuse:
  - `260323_1305_wrapper-runtime-isolation-hardening`
  - `260323_1407_bootstrap-generic-export`
  - `260323_1507_bootstrap-partial-install`
  - `260323_1705_universal-skills-runtime-integration`
  - `260323_1827_universal-skills-local-source-and-discovery`
- This session was intentionally created as a planning-only workstream. No implementation or new validation commands beyond read-only repo inspection should be added until execution is explicitly approved.

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
