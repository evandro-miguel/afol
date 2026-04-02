---
doc_type: spec
id: 260307_persistent-planning-memory_spec_01
theme: persistent-planning-memory
status: active
owners:
- orchestrator
created_at: '2026-03-07T17:34:00-03:00'
updated_at: '2026-03-07T18:19:40-03:00'
links:
  roadmap: 260223_0000_arc_roadmap_01
scope:
  repo_areas:
  - .agents/scripts
  - docs/templates
  - docs/standards
  - .agents/wb
  packages:
  - session catchup
  - planning memory
  - resume ergonomics
risk_level: medium
---

# SPEC: Persistent Planning Memory and Session Catchup

## 1) Objective
- Add a native, repo-local working-memory model that preserves the value of the three-file planning pattern while keeping `.agents/wb/` as the canonical execution system.

## 2) Problem
- The current scaffold has durable workbench artifacts, but operators still need to remember when to sync discoveries into them.
- There is no first-class "resume/catchup" command that checks whether workbench state drifted from git state before work continues.
- The system does not yet expose a simple mental model for operators who think in `task_plan.md`, `findings.md`, and `progress.md`.
- External content can still be copied into plan-like artifacts unless the boundary is made explicit in docs and validation.

## 3) Non-goals
- This spec does not replace roadmap/spec/workbench governance with ad hoc root markdown files.
- This spec does not introduce cloud memory, vector databases, or cross-repo state.
- This spec does not require heavyweight hooks that are unavailable across runtimes.

## 4) Scope
In scope:
- A native mapping of lightweight planning-memory concepts onto canonical workbench artifacts.
- A catchup/resume flow that summarizes unsynced session context before execution.
- Freshness rules for research/log updates during exploration-heavy work.
- Validation and review checks for stale planning-memory artifacts in major work.

Out of scope:
- Rebuilding the workbench around separate root-level `task_plan.md`, `findings.md`, and `progress.md` files.
- Runtime-specific hidden memory systems outside repository artifacts.

## 5) Users and Use Cases
Primary users:
- Agents resuming work after context loss or session gaps.
- Reviewers who need proof that exploration findings were preserved before decisions were made.

Use cases:
- UC-01 An agent resumes a session and needs one command that compares workbench artifacts with current repo changes before proceeding.
- UC-02 An operator prefers the three-file planning mental model and needs a system-native mapping without bypassing governance.
- UC-03 An exploration-heavy task needs guardrails so findings are written to durable artifacts instead of staying only in model context.
- UC-04 A reviewer needs to confirm that untrusted external content was stored in research/findings artifacts, not in plan files.

## 6) Canonical Model
- `task_plan.md` concept maps to workbench `plan`.
- `findings.md` concept maps to workbench `research`.
- `progress.md` concept maps to workbench `log`.
- `task`, `report`, and optional `postmortem` remain required governed artifacts around that lightweight core.

## 7) Proposed Solution
Summary:
- Add a persistent-planning-memory layer that improves workflow ergonomics without creating a second source of truth.

Key design choices:
- Keep `.agents/wb/` canonical; do not standardize separate root planning files.
- Add a `session catchup` workflow that checks active session docs, `git status`, and recent diffs before work resumes.
- Teach runtimes and docs a simple mapping between lightweight memory concepts and governed workbench artifacts.
- Add validation heuristics for stale research/log artifacts when plans or implementations advance after large exploration bursts.
- Route all external and instruction-like content to `research` artifacts, never to `plan`.

## 8) Experience and Behavior
- Expected behavior:
  - A catchup command reports active session, changed files, stale/missing artifacts, and the next safe planning step.
  - Operators can understand the system through a lightweight "plan/findings/progress" lens while still using workbench docs.
  - Review and verification flows surface when exploration evidence was not persisted.
- Failure handling:
  - If no active session exists, the system should point to recent sessions and recommend creating or selecting one.
  - If git drift exists without corresponding log/report updates, the system should flag that mismatch before execution continues.

## 9) Risks and Tradeoffs
- Risk: added workflow checks feel heavy for quick tasks -> Mitigation: keep quick mode exempt and scope freshness checks to governed major work.
- Risk: operators mistake aliases for new canonical files -> Mitigation: document the mapping explicitly and keep workbench as the only source of truth.
- Risk: cadence heuristics become noisy -> Mitigation: start with conservative checks tied to major-plan and exploration artifacts only.

## 10) Acceptance
- Success looks like:
  - The repo has a documented, explicit mapping from lightweight memory files to workbench artifacts.
  - Resume/catchup flow highlights unsynced context before further work.
  - Major governed sessions can be reviewed for planning-memory freshness and safe external-content handling.
  - The feature integrates with existing `status`, `review`, `verify`, and workbench update flows.

## 11) Verification Philosophy
- Evidence should come from deterministic artifact and git-state checks.
- Validation should prove both artifact presence and synchronization quality, not just file existence.

## 12) Rollout
1. Define workflow, terminology, and boundaries in roadmap/spec/docs.
2. Add catchup/resume command design.
3. Extend status/review/verify with freshness signals.
4. Update templates and runtime docs only after command semantics are stable.

## 13) Acceptance Checklist
- [x] Objective and non-goals are explicit
- [x] Canonical mapping is explicit
- [x] Catchup/resume behavior is explicit
- [x] Safety boundary for external content is explicit
- [x] Rollout and verification philosophy are explicit

---
*Spec: `docs/arc/SPECS/260307_persistent-planning-memory_spec_01.md`*
