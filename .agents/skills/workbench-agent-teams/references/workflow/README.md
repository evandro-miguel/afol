---
description: Workbench execution workflow with active-session handling, task states, and closure checks.
metadata:
  tags: "workflow, active-session, task states, testing, verification"
---

# Workbench Workflow

## Session Creation

- Prefer scaffold automation such as `.agents/agents new ...` or the repo's equivalent instead of manually creating folders.
- Automation commonly:
  - creates the initial `plan`, `task`, and `log`
  - fills frontmatter placeholders
  - updates `.agents/wb/.active_session`
- For multi-session repos, prefer explicit `--session` targeting on later write commands.

## Roles

- Orchestrator: creates session docs and keeps task states current.
- Worker: implements code and updates task state.
- Tester: runs tests when a task is ready for verification.
- Explorer/Researcher: validates repo reality before or during planning on larger workstreams.

## Task States

- `-[]` pending
- `-[/]` in progress
- `-[x]` completed

Agents must mark `-[/]` at task start and `-[x]` when finished.

Some richer scaffolds also keep a state-board table with values such as:

- `pending`
- `in_progress`
- `ready_for_test`
- `testing`
- `done`
- `blocked`

## Large Plan Rule

- If a plan exceeds 500 lines, split the work into phases.
- Create one dedicated `task` file per phase in the same session folder.

## Major-Work Planning Rule

- For major workstreams, create `brainstorm` before treating the plan as complete.
- Add `explorer-check` to prove the current repo was inspected, not inferred.
- Link these artifacts from the plan when the scaffold supports frontmatter links.

## Mandatory Reporting Rule

- Every agent execution must produce a `report` file that documents:
  - problems found
  - solutions applied
- For larger governed sessions, also close with a `postmortem` so future agents can reuse the real outcome.

## Critical Dependency Rule

- Every plan must include a concise section with critical Tools, MCPs, and Skills.
- Executors must validate whether additional critical dependencies are needed before execution.

## Governance Context Rule

- When the repository uses roadmap/spec governance, carry `roadmap_feature`, `parent_spec`, and optional `child_spec` through plan/task/log/report artifacts.
- Workstreams execute approved intent; they should not silently replace roadmap/spec decisions.
- Prefer a full `spec` when feature intent, decomposition, or validation philosophy is still being clarified.
- Prefer `spec-lite` only when the parent spec already answers the strategic questions and the workstream is tightly bounded.
- Use `blocks` when delivery is stalled by a missing decision, dependency, or unresolved contradiction.

## Testing Flow

- Worker moves tasks to a stable checkpoint before tester handoff.
- Tester runs unit tests first.
- Tester runs E2E only if unit tests pass and E2E exists.
- Tester records command, result, and evidence in report/log files.
- When the scaffold uses evidence automation, task completion should reference recorded evidence rather than a bare checkbox flip.

## Automation Preference

- Prefer `wb-update` automation for:
  - `updated_at` refreshes
  - task marker changes
  - status changes
  - timeline entries
  - link updates
  - report file-list refreshes
  - evidence registration
- If the scaffold documents `updated_at` automation, do not update that field manually.

## Closure Flow

- Run `verify-tasks` or the repo's session-completion checker before closure.
- Run plan/session review commands when the scaffold provides them.
- Mark the report final only after verification evidence is recorded and closure artifacts are in place.
- For governed repos, treat documentation freshness and lint/review gates as part of done, not post-work cleanup.
