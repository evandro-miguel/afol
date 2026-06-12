---
doc_type: spec
id: 260612_session-json-state-and-markdown-projection_spec-child_01
theme: session-json-state-and-markdown-projection
status: draft
owners:
- orchestrator
created_at: '2026-06-12T12:12:33-03:00'
updated_at: '2026-06-12T13:37:19-03:00'
roadmap_feature: F-18
spec_role: child
parent_spec: 260612_afol-administration-project-structure-onion-architecture_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  parent: docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md
  related: docs/arc/SPECS/260612_agent-operational-state-context-library_spec_01.md
scope:
  repo_areas:
  - .afol/wb
  - cli/services/workbench
  - cli/commands
  packages:
  - agentic-cli
risk_level: high
---

# SPEC CHILD: session-json-state-and-markdown-projection

## 1) Feature Intent

- Outcome: AFOL writes structured JSON state for every governed session and
  treats Markdown plans/tasks/logs as controlled human projections.
- Why now: The workbench already promises structured state as the source of
  truth. This child makes the first concrete storage and rendering contract.
- Roadmap feature: `F-18`
- Role of this spec: child delivery contract for session JSON state and managed
  Markdown projection.
- ADR-004 note: JSON must not become the sole source of truth. Under the target
  architecture, Markdown/YAML remains canonical and SQLite becomes the
  materialized execution layer. JSON/JSONL is used for events, errors,
  snapshots, generated indexes, and bounded session interchange.

## 2) Problem

The current workbench lifecycle creates Markdown plan/task/log files and an
evidence JSONL ledger. Agents can still infer state from Markdown tables and
manually edit sections that should be command-owned.

## 3) Users and User Journey

Primary users:

- worker agents updating task state,
- orchestrators reviewing session state,
- maintainers auditing Markdown drift.

User journey:

1. `afol new` creates a session.
2. AFOL creates `.afol/wb/<session>/json/`.
3. AFOL writes `session.json`, `plan.json`, `tasks.json`, `tools.json`,
   `context.json`, and `spec-checks.json`.
4. AFOL renders `plan.md` and `task.md` managed blocks from JSON.
5. `afol state validate` detects drift between JSON and managed Markdown.
6. `afol state sync` re-renders managed Markdown from JSON.
7. If a lifecycle command fails, AFOL records a structured command-error event
   before returning the failure to the operator.

Failure or friction points:

- Manual edit inside managed block -> validation reports drift and sync
  overwrites or reports the managed block difference.
- Human note outside managed block -> sync preserves it.
- Missing JSON file -> validation reports missing operational state.
- Failed command execution, including `afol done -x` -> AFOL records the
  failure in an error event stream with enough detail to reproduce or fix the
  command path later.

## 4) Experience and Behavior

Expected behavior:

- Session JSON path: `.afol/wb/<session>/json/`.
- Required MVP files:
  - `session.json`
  - `plan.json`
  - `tasks.json`
  - `tools.json`
  - `context.json`
  - `spec-checks.json`
- Optional bundle path: `.afol/wb/<session>/json/bundles/`.
- Session-local error projection path:
  `.afol/wb/<session>/json/command-errors.jsonl` when the failure is tied to a
  session. The canonical source may be a global AFOL event stream as long as the
  session view can be rebuilt.
- Markdown managed blocks use explicit comments such as
  `<!-- afol:tasks:start -->` and `<!-- afol:tasks:end -->`.

Boundaries:

- Agents should not edit `plan.md` or `task.md` managed blocks as operational
  truth.
- No Markdown mirror is required for every JSON file.
- Evidence remains `.evidence.jsonl` until a later accepted migration changes
  that contract.
- Error logs are diagnostics, not successful evidence. A later successful
  evidence record can supersede a failed operation for closure, but the failed
  command-error record remains available for debugging.

## 5) Scope

In scope:

- JSON schema definitions for session, plan, tasks, tools, context, and spec
  checks.
- `afol state init -S <session>`.
- `afol state show -S <session> --json`.
- `afol state validate -S <session>`.
- `afol state sync -S <session>`.
- `afol render plan -S <session>`, `afol render task -S <session>`, and
  `afol render all -S <session>`.
- Existing lifecycle commands updating JSON before rendering Markdown.
- Command-error schema and append behavior for failed AFOL lifecycle commands,
  including parse failures, unsafe argument failures, failed child-process
  execution, stale-state validation failures, and close/verify rejection.

Out of scope:

- Database-backed state.
- Removing Markdown plan/task files.
- Requiring humans to manually edit JSON.
- Rewriting old sessions in place without an explicit migration.

## 6) Child Spec Strategy

- Child specs required: no.
- This child is already a bounded delivery slice under F-18.

## 7) Constraints and Assumptions

Assumptions:

- Existing sessions may not have JSON state and need a non-destructive init or
  migration path.
- Current workbench commands must continue to pass existing tests.

Constraints:

- Compatibility: current `afol new/start/evidence/done/close/verify-tasks`
  behavior must remain valid.
- Operational: session locking must protect JSON and Markdown projection
  updates together.
- Security/privacy: JSON state must not store secrets or private prompt bodies
  by default.
- Security/privacy: command-error records must redact secret-looking values and
  avoid storing full unbounded stdout/stderr by default.

## 8) Acceptance

- `afol new` creates the MVP JSON files for a new session.
- `afol start`, `afol evidence`, `afol done`, and `afol close` update JSON
  before rendering managed Markdown.
- `afol state validate` fails when required JSON is missing or managed Markdown
  diverges.
- `afol state sync` re-renders managed Markdown from JSON.
- Human content outside managed blocks is preserved.
- Failed AFOL lifecycle commands write command-error records before returning
  non-zero, including the command, args, exit code when known, failure class,
  session/task when known, bounded output excerpt, and recovery hint.
- Existing workbench lifecycle tests remain green.

## 9) Risks and Tradeoffs

- Risk: dual Markdown/JSON state causes temporary complexity -> Mitigation:
  JSON is authoritative and managed Markdown is projection only.
- Risk: old sessions fail strict validation unexpectedly -> Mitigation:
  require explicit state init/migration for old sessions and keep compatibility
  behavior separate.

## 10) Rollout and Lifecycle

- Start with new sessions only.
- Add migration/init for existing sessions after schema tests are stable.
- Backout by leaving existing Markdown lifecycle untouched and disabling JSON
  state validation for sessions without initialized JSON.

## 11) Verification Philosophy

- Add schema tests for every JSON file.
- Add lifecycle tests proving command updates write JSON and render Markdown.
- Add drift tests for managed block edits and preserved human notes.
- Add failure-path tests for `done -x`, parse errors, close rejection, and
  stale-state validation error logging.
- Run `bun run typecheck`, `bun test`, and `afol validate project --json`.
