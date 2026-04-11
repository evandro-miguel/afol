---
doc_type: plan
id: 260411_1415_system-pending-improvement-plan_plan_01
status: active
created_at: '2026-04-11T14:11:00-03:00'
updated_at: '2026-04-11T14:24:25-03:00'
title: System Pending Improvement Plan
theme: system-pending-improvement-plan
owners:
- orchestrator
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
---

## System Pending Improvement Plan

## Context

This plan records the current pending items found during the 2026-04-11 system check.
It is stored under `docs/arc/` because `.agents/` is currently mounted read-only and
cannot accept new workbench artifacts.

## Evidence

- `./.agents/agents doctor` passed with no issues.
- `make lint` passed with 0 issues across the configured lint scope.
- `make test-scripts` passed with 201 tests selected, 201 passed, and 6 deselected.
- `make verify-active` passed for `.agents/wb/260404_1558_repo-quality-and-governance`.
- `make verify-strict-if-present` failed because completed tasks exist but no report
  document was found.
- `./.agents/agents status --json` reports the active plan blocked by missing
  `brainstorm`, `research`, and `explorer-check` dependencies, while the task board is
  8/8 done.
- `findmnt -R /home/ozy/apps/agentic_start_folder` shows `.agents/`, `.git/`, and
  `.codex/` mounted read-only, while the repository root and `docs/` are writable.
- `git status --short | wc -l` reported 517 changed paths before this plan artifact
  was added.

## Findings

1. The active workstream needs closure hygiene.
   The active session `260404_1558_repo-quality-and-governance` has completed tasks and
   passing normal verification, but strict verification fails because no report artifact
   exists.

2. The active session has artifact-state drift.
   The plan and task say the quality pass is complete, but status still considers the
   plan blocked by missing planning support artifacts. The `spec-lite` also still
   contains template placeholders.

3. The repository has a large uncommitted change set.
   The current status includes 417 modified paths, 49 deleted paths, 50 untracked
   paths, and one modified submodule entry. The largest groups are docs, skills,
   archived workbench sessions, cache/upstream snapshots, and runtime adapter docs.

4. `.agents/` is not writable in the current environment.
   Workbench closure artifacts cannot be created or updated until the `.agents/` mount
   is writable again.

## Improvement Plan

1. Restore write access for `.agents/`.
   Confirm why `/home/ozy/apps/agentic_start_folder/.agents` is mounted read-only and
   remount or reopen the workspace so workbench artifacts can be updated.

2. Close the active session evidence gap.
   Create the report artifact under the active session folder:

   Use `.agents/wb/260404_1558_repo-quality-and-governance/` as the session folder.

   Create `260404_1558_repo-quality-and-governance_report_01.md` inside it.

   Add the existing validation evidence from the plan/task artifacts, then rerun
   `make verify-strict-if-present`.

3. Resolve artifact-state drift.
   Either materialize useful `brainstorm`, `research`, and `explorer-check` artifacts
   for the active session or update the workflow artifact dependency rules so a focused
   quality pass can explicitly mark those artifacts as not applicable without making
   status look blocked.

4. Replace the placeholder `spec-lite`.
   Fill `260404_1558_repo-quality-and-governance_spec-lite_01.md` with concrete
   intent, boundaries, risk, and acceptance, or archive/remove it if the session does
   not need a local spec refinement.

5. Triage the 517-path working tree.
   Split changes into at least four review buckets: core docs/runtime sync, critical
   script tests and policies, skills/universal-skills sync, and cache/archive movement.
   Do not commit generated cache or archive churn unless it is explicitly part of the
   intended deliverable.

6. Add a guardrail for direct verification ergonomics.
   Consider teaching `./.agents/agents verify-tasks <session-id>` to resolve
   `.agents/wb/<session-id>` automatically, matching the Makefile wrapper behavior and
   avoiding false "session folder not found" failures.

## Acceptance Criteria

- `make verify-strict-if-present` passes.
- `./.agents/agents status` reports no blocked active plan for completed work.
- The active `spec-lite` has no placeholder fields, or the session no longer carries an
  unnecessary `spec-lite`.
- The worktree is grouped into reviewable buckets with cache/archive churn separated
  from source/docs changes.
- The write-access issue for `.agents/` is understood and documented in the final
  closure report.

---
*Created from the 2026-04-11 system pending check.*
