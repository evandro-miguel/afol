# Plan: plan-task-root-cause

- Created by native CLI workbench lifecycle.

## Native command metadata
- task: Investigate why afol new only creates one task and plan the fix

## Root Cause

- `afol new` is currently single-task by implementation, not by downstream
  workbench limits.
- `cli/commands/workbench/args.ts` parses only one `--task` into
  `metadata.task`.
- `cli/services/workbench/lifecycle.ts` defines `NewWorkstreamMetadata.task` as
  a scalar string, renders one plan bullet, and writes one task row:
  `T-01`.
- `sessionPaths()` exposes one canonical task-board file
  `${session}_task_01.md`; that file can still contain multiple task rows.
- `startTask()`, `doneTask()`, `closeSession()`, and
  `verifyWorkbenchTasks()` already operate on task IDs/rows, so the narrow fix
  is to make session creation render multiple rows, not to rewrite lifecycle
  state handling.
- `quick-task` intentionally remains a single-task convenience flow and
  hardcodes `T-01`; it should keep that behavior unless explicitly redesigned.

## Execution Plan

- T-01: Confirm root cause and create the execution plan.
- T-02: Define the backwards-compatible CLI contract for multi-task `afol new`.
- T-03: Update the workbench data model and render helpers to support ordered
  task summaries.
- T-04: Update `newWorkstream()` to render `T-01..T-N` in the plan and task
  board.
- T-05: Update parser/help surfaces while preserving existing single-task and
  `quick-task` behavior.
- T-06: Add targeted tests for multi-task creation and lifecycle follow-through.
- T-07: Run focused validation, then the AFOL release gate if code changes are
  accepted.

## Validation

- Unit parser check: repeated `--task` values are preserved in order.
- Lifecycle check: `newWorkstream()` with multiple tasks creates one task-board
  file containing `T-01`, `T-02`, and `T-03`.
- Kernel check: `afol new <theme> --task "A" --task "B" --json` creates both
  task rows and both plan bullets.
- Start/done check: when multiple pending tasks exist, `afol start` without
  `--task-id` continues to fail with the existing "multiple pending tasks"
  guard; explicit `--task-id T-02` works.
- Verification check: strict verification still requires passed evidence for
  every done task.
- Repo checks, in order: targeted Bun tests, `bun run typecheck`,
  `afol local-state rebuild --json`, `afol validate project --json`, and
  `bun run validate:release` if this becomes an implementation slice.

## Closure Criteria

- Existing one-task invocations produce the same visible output and file names.
- Repeated `--task` creates multiple numbered task rows in one canonical
  `${session}_task_01.md` file.
- Generated plan bullets match the same task IDs as the state board.
- `start`, `evidence`, `done`, `close`, local-state indexing, and strict verify
  continue to work with multi-task sessions.
- Help/docs mention repeated `--task` only after the implementation and tests
  land.

## Risks

- This repo is already dirty in unrelated generated skill/template files; do not
  mix those changes into the implementation slice.
- Avoid adding parallel task files unless there is a stronger reason; existing
  scanners already support multiple rows inside the canonical task file.
- Do not change `quick-task` semantics while fixing `afol new`.
