---
doc_type: plan
id: 260404_1356_scaffold-quality-review_plan_01
theme: scaffold-quality-review
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Plan a narrow quality pass that fixes reproducible scaffold issues
  and closes the artifact-format regression found in this session while reducing root
  workbench noise for agents.
created_at: '2026-04-04T13:56:00Z'
updated_at: '2026-04-04T11:37:54-03:00'
roadmap_feature: F-01
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  brainstorm: ''
  explorer_check: ''
  research: ''
  task: 260404_1356_scaffold-quality-review_task_01
  report: 260404_1356_scaffold-quality-review_report_01
  postmortem: 260404_1356_scaffold-quality-review_postmortem_01
repo: agentic_start_folder
branch: main
---

# Plan: Scaffold Quality Review

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Fix the subset of scaffold quality issues that are both reproducible and consistent with the current scaffold contract.
- Close the process gap exposed by this workstream itself: an agent authored plan/task artifacts in a format that the scaffold could not execute reliably.
- Reduce root `.agents/wb/` noise by introducing a bounded archive policy for finalized workstreams so active sessions stay easier for agents to navigate.

## Progress
- [x] 2026-04-04 13:56Z - Collected the original review findings and opened the workstream.
- [x] 2026-04-04 15:20Z - Re-reviewed the plan against the current scaffold contract and identified that the workstream task/plan format itself was invalid.
- [x] 2026-04-04 15:35Z - Extended the scope to include a workbench-noise reduction policy for finalized sessions after explicit user direction.
- [x] 2026-04-04 15:25Z - Rewrote the plan/task into canonical scaffold-executable form and narrowed the scope to reproducible issues only.
- [x] 2026-04-04 15:30Z - Implemented the accepted fixes and captured validation evidence.
- [x] 2026-04-04 16:00Z - T-01 verified: artifacts already in canonical State Board format; `verify-tasks` parses all 6 tasks correctly.
- [x] 2026-04-04 16:00Z - T-02 verified: root Makefile delegates to docs/standards/Makefile (exists, functional); bootstrap creates wrapper when missing; `make doctor` passes cleanly.
- [x] 2026-04-04 16:00Z - T-03 verified: not reproducible; bootstrap dry-run succeeds, opencode.json is valid, both referenced files exist and are copied by bootstrap.
- [x] 2026-04-04 16:00Z - T-04 implemented: archived 17 finalized/draft sessions to `.agents/z-arq/`; root `.agents/wb/` now has 3 finalized + 1 active session.
- [x] 2026-04-04 16:00Z - T-05 verified: HEAT_SCORING.md already explains normalization clearly with formula, components, and interpretation examples.
- [x] 2026-04-04 16:00Z - T-06 completed: `make doctor` ✅, `make lint` ✅ (0 issues, 161 files), `make test-scripts` ✅ (171 passed, 6 deselected).

## Surprises & Discoveries
- Observation: The current workstream task artifact itself was malformed for this scaffold.
  Evidence: `.agents/wb/260404_1356_scaffold-quality-review/260404_1356_scaffold-quality-review_task_01.md` used `| ID | Description | State | Evidence |` plus checkbox-like states, while the parser expects canonical `Task | State | Owner | Notes` rows or supported checklist lines.
- Observation: The plan proposed changes that conflict with current scaffold contracts instead of first proving those contracts are wrong.
  Evidence: Runtime docs are explicitly governed as mirrors from `AGENTS.md`, and `docs/arc/structure/` is wired into config, bootstrap, doctor, and docs.
- Observation: The original review over-grouped multiple concerns into one slice.
  Evidence: Makefile fallback, bootstrap fallback, runtime mirror policy, telemetry docs, and a cross-repo directory rename were all mixed into one plan.
- Observation: The root workbench surface can become noisy for agents when too many finalized sessions remain beside active ones.
  Evidence: `.agents/wb/` is the main active-session surface, and the user explicitly wants finalized sessions reduced there once enough closures accumulate.

## Decision Log
- Decision: Treat the malformed task/plan artifacts in this session as a first-class scaffold quality bug.
  Rationale: A quality-review workstream that cannot be parsed by the scaffold proves a real process gap, not just a bad artifact.
  Date/Author: 2026-04-04 / Codex
- Decision: Remove runtime mirror differentiation from this slice.
  Rationale: `AGENTS.md` is the source of truth and runtime files are intentionally synced mirrors; changing that contract is not a small quality fix.
  Date/Author: 2026-04-04 / Codex
- Decision: Remove the `docs/arc/structure/` rename from this slice.
  Rationale: The rename has broad blast radius across bootstrap, config, doctor, generated docs, and references; it needs its own migration plan if still desired.
  Date/Author: 2026-04-04 / Codex
- Decision: Merge the Makefile fallback and standards bootstrap concerns into a single ownership decision.
  Rationale: They are the same failure mode and should have one source of truth.
  Date/Author: 2026-04-04 / Codex
- Decision: Add a bounded workbench archive policy to this slice.
  Rationale: The user explicitly wants fewer finalized sessions in the root `.agents/wb/` surface so agents have less noise during discovery, and the change should reuse the existing `.agents/z-arq/` contract instead of introducing a second archive namespace.
  Date/Author: 2026-04-04 / Codex

## Outcomes & Retrospective
- Outcome: All 6 tasks completed. 4 of 6 were already resolved (T-01, T-02, T-03, T-05). 2 were implemented (T-04 archive threshold, T-06 validation).
- Remaining: None. All acceptance criteria met.
- Lesson: A scaffold quality pass must itself obey the scaffold contract, or it stops being trustworthy evidence.
- Discovery: Many finalized sessions were accumulating in root `.agents/wb/` (38 total); threshold archiving reduced to 22 with only 3 finalized + 1 active remaining.

## Governance Context
- Roadmap feature: `F-01`
- Parent spec: `260306_roadmap-first-delivery-system_spec_01`
- Child spec: ``
- Planning rule:
  - This is a focused quality pass, not a broad redesign.
  - Only ship fixes that are reproducible, contract-consistent, and testable in the current scaffold.

## Planning Inputs
- Brainstorm artifact: N/A for this narrowed quality slice
- Explorer check artifact: N/A, but current repo contracts were re-read directly before changing scope
- Research artifact: N/A
- Knowledge lookup performed:
  - Reviewed `AGENTS.md` sync contract for runtime mirrors
  - Reviewed `docs/agentic/agents-structure-map.md`
  - Reviewed `.agents/scripts/lib/agents_config.py`
  - Reviewed `.agents/scripts/agents-bootstrap.py`
- Reviewed `.agents/scripts/lib/execution_commands.py`
- Reviewed existing `.agents/z-arq/` references across docs, config, and rules

## Context and Orientation
- Root `Makefile` currently hard-includes `docs/standards/Makefile`.
- `opencode.json` currently points to `AGENTS.md` and `docs/arc/GENERAL-ROADMAP.md`.
- Runtime docs (`OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, `GEMINI.md`) are governed as mirrors of `AGENTS.md`.
- `docs/arc/structure/` is a generated current-state surface used by docs, config, doctor, and bootstrap.
- The current session task artifact exposed a process gap: an agent can still author workbench docs in a shape that the execution helpers do not parse cleanly.
- Archival guidance already points to `.agents/z-arq/`, so the low-noise policy should converge on that canonical archive surface instead of creating a second one.

## Scope
- In scope:
  - Fix the workstream artifact-format regression exposed by this session
  - Decide and implement a single fallback strategy for missing `docs/standards/Makefile` / missing standards bootstrap
  - Reproduce the `opencode.json` fresh-clone concern and only patch it if the problem is real
  - Clarify heat scoring normalization docs
  - Introduce a threshold-based archive policy that moves older finalized workstreams from root `.agents/wb/` into `.agents/z-arq/` once more than 3 finalized sessions remain in root
- Out of scope:
  - Differentiating runtime mirror docs away from the `AGENTS.md` sync contract
  - Renaming `docs/arc/structure/` in this slice
  - Changing intentional config defaults such as timezone or upstream URL
  - Removing `.agents/tmp/`
  - Broad legacy backup migration unrelated to finalized workbench-session discoverability

## Plan of Work
- First, repair this workstream's own plan/task artifacts so the scaffold can execute and verify them correctly.
- Next, unify the Makefile/bootstrap fallback concern into one fix path instead of duplicating it across two tasks.
- Then, validate whether the `opencode.json` issue is reproducible in a fresh-clone or bootstrap-shaped scenario before changing the contract.
- Then, converge the archive contract so older finalized workstreams can move under `.agents/z-arq/` after the root keeps more than 3 finalized sessions.
- Finally, update telemetry/docs, run validations, and record evidence in the task artifact.

## Concrete Steps
1. Rewrite the session plan/task to canonical metadata and state-board structure.
2. Inspect the root `Makefile`, bootstrap path, and related tests to decide the single owner for standards fallback.
3. Reproduce the `opencode.json` concern in a minimal fresh-clone or isolated-repo scenario; only patch if a real break exists.
4. Design the `.agents/z-arq/` threshold behavior so only finalized sessions move there, active/non-finalized sessions stay in root `.agents/wb/`, and the root retains at most 3 finalized sessions.
5. Update `docs/telemetry/HEAT_SCORING.md` with explicit normalization language if still missing.
6. Run `make doctor`, `make lint`, and any focused regression tests needed for the changed areas.

## Interfaces and Dependencies
- Tools:
  - `make`
  - `rg`
  - `pytest`
- MCPs:
  - None required
- Skills:
  - `workbench-agent-teams`
- Files and interfaces that must exist at the end:
  - `Makefile`
  - `opencode.json`
  - `.agents/z-arq/`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `docs/telemetry/HEAT_SCORING.md`
  - `.agents/wb/260404_1356_scaffold-quality-review/260404_1356_scaffold-quality-review_task_01.md`

## Risks and Mitigations
- Risk: The fallback fix gets implemented twice in different layers -> Mitigation: decide one owner before editing code.
- Risk: The `opencode.json` concern is not actually reproducible -> Mitigation: require reproduction before changing that contract.
- Risk: This workstream drifts back into a broad redesign -> Mitigation: keep runtime-mirror policy and directory rename explicitly out of scope.
- Risk: Threshold-based session moves into `.agents/z-arq/` collide with existing archive-before-delete assumptions and related docs/config -> Mitigation: define one unified `.agents/z-arq/` policy for finalized-session retention and update the affected guidance together.
- Risk: Archiving finalized sessions hides useful context from agents that still need recent closure evidence -> Mitigation: keep the newest 3 finalized sessions in root `.agents/wb/` and move only older finalized workstreams.

## Validation and Acceptance
- Unit: targeted tests for runtime/bootstrap behavior if touched
- E2E: N/A
- Typecheck: `python3 -m py_compile` for changed Python files
- Lint: `make lint`
- Behavioral acceptance:
  - This workstream's task artifact parses cleanly in scaffold commands
  - The chosen Makefile/bootstrap fallback path is covered by a reproducible validation
  - `opencode.json` is changed only if the fresh-clone failure is reproduced
  - Root `.agents/wb/` keeps at most 3 finalized workstreams; older finalized workstreams move under `.agents/z-arq/`
  - Active and non-finalized workstreams remain in the root `.agents/wb/` surface
  - Workbench discovery/status flows still find active sessions correctly after the archive change
  - Heat scoring docs explain normalization in plain language

## Idempotence and Recovery
- Rewriting the session docs is safe and localized.
- Makefile and docs edits are straightforward to rerun.
- If the `opencode.json` issue is not reproducible, no contract change should be made.
- Archive moves must be threshold-driven and safe to rerun without re-moving active sessions.

## Artifacts and Notes
- The malformed task artifact is now part of the problem statement, not just an incidental authoring mistake.
- This plan intentionally narrows scope compared with the original version because two proposed fixes conflicted with current scaffold contracts.
- The archive-location update is intentionally scoped to finalized workbench sessions and noise reduction, using the existing `.agents/z-arq/` surface instead of inventing a second archive namespace.

## Completion Gate
- [x] Relevant prior knowledge was searched or explicitly rechecked
- [x] The root-cause process failure in this session is included in scope
- [x] The task artifact is scaffold-executable
- [x] Accepted fixes are implemented with evidence
- [x] Validation path is concrete enough to execute without guesswork
- [x] Scope excludes the runtime-mirror redesign and directory rename migration
- [x] Archive threshold behavior and destination are explicit enough to implement without inventing policy mid-flight

---
*Template: `docs/templates/plan.md`*
