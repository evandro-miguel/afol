---
doc_type: spec
id: 260612_workbench-hydration-and-markdown-projection_spec-child_01
theme: workbench-hydration-and-markdown-projection
status: draft
owners:
- orchestrator
created_at: '2026-06-12T12:12:33-03:00'
updated_at: '2026-06-12T16:47:37-03:00'
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

# SPEC CHILD: workbench-hydration-and-markdown-projection

## 1) Feature Intent

- Outcome: AFOL hydrates governed workbench Markdown/evidence into SQLite
  materialized execution state and treats managed Markdown blocks as controlled
  human projections.
- Why now: The workbench already promises structured state, but the stronger
  target architecture is Markdown/YAML authorship plus SQLite materialization,
  not live JSON files as another source of truth.
- Roadmap feature: `F-18`
- Role of this spec: child delivery contract for workbench hydration, managed
  Markdown projection, and optional JSON debug exports.
- ADR-004 note: Markdown/YAML remains canonical and SQLite becomes the
  materialized execution layer. JSON/JSONL is used for events, evidence, errors,
  debug snapshots, generated indexes, and bounded session interchange.

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
2. AFOL reads `.afol/wb/<session>/*.md` and `.evidence.jsonl`.
3. AFOL hydrates session, task, evidence, tools, context, and spec-check state
   into `.afol/state/afol.db`.
4. AFOL renders managed blocks in `plan.md` and `task.md` from materialized
   state.
5. `afol state validate` detects stale hydration, managed-block drift, and
   missing evidence state.
6. `afol state export -S <session> --json` can write bounded debug snapshots
   when agents/scripts need an interchange format.
7. If a lifecycle command fails, AFOL records a structured command-error event
   before returning the failure to the operator.

Failure or friction points:

- Manual edit inside managed block -> validation reports drift and sync
  overwrites or reports the managed block difference.
- Human note outside managed block -> sync preserves it.
- Stale SQLite materialization -> validation reports the source hash mismatch
  and points to hydrate/rebuild.
- Multiple open sessions and `.active_session` ambiguity -> health warns and
  governed multi-agent commands require explicit `-S <session>`.
- Failed command execution, including `afol done -x` -> AFOL records the
  failure in an error event stream with enough detail to reproduce or fix the
  command path later.

## 4) Experience and Behavior

Expected behavior:

- Canonical session authoring paths: `.afol/wb/<session>/*.md` and
  `.afol/wb/<session>/.evidence.jsonl`.
- Materialized state path: `.afol/state/afol.db`.
- Optional debug/interchange exports may be written under
  `.afol/wb/<session>/json/`, but they are snapshots, not the active
  operational source.
- Session-local error projection path:
  `.afol/wb/<session>/json/command-errors.jsonl` when the failure is tied to a
  session. The canonical source may be a global AFOL event stream as long as the
  session view can be rebuilt.
- Markdown managed blocks use explicit comments such as
  `<!-- afol:tasks:start -->` and `<!-- afol:tasks:end -->`.
- Sessions record `created_at`, `last_touched_at`, `stale_after`, `closed_at`
  when closed, and git branch/commit when relevant.

Boundaries:

- Agents should not edit `plan.md` or `task.md` managed blocks by hand.
- No live JSON mirror is required for every workbench state record.
- Evidence remains `.evidence.jsonl` until a later accepted migration changes
  that contract.
- Error logs are diagnostics, not successful evidence. A later successful
  evidence record can supersede a failed operation for closure, but the failed
  command-error record remains available for debugging.
- `.afol/wb/.active_session` is convenience state only. It must not be trusted
  for multi-agent lifecycle commands.

## 5) Scope

In scope:

- Hydration schema definitions for session, plan, tasks, tools, context, spec
  checks, and evidence indexes.
- `afol hydrate -S <session>`.
- `afol state show -S <session> --json`.
- `afol state validate -S <session>`.
- `afol state sync -S <session>`.
- `afol state export -S <session> --json`.
- `afol wb health --json`.
- `afol render plan -S <session>`, `afol render task -S <session>`, and
  `afol render all -S <session>`.
- Existing lifecycle commands hydrating materialized state before rendering
  managed Markdown.
- Command-error schema and append behavior for failed AFOL lifecycle commands,
  including parse failures, unsafe argument failures, failed child-process
  execution, stale-state validation failures, and close/verify rejection.

Out of scope:

- Treating JSON snapshots as live source of truth.
- Removing Markdown plan/task files.
- Requiring humans to manually edit JSON.
- Rewriting old sessions in place without an explicit migration.

## 6) Child Spec Strategy

- Child specs required: no.
- This child is already a bounded delivery slice under F-18.

## 7) Constraints and Assumptions

Assumptions:

- Existing sessions may not have materialized state and need a non-destructive
  hydrate or migration path.
- Current workbench commands must continue to pass existing tests.

Constraints:

- Compatibility: current `afol new/start/evidence/done/close/verify-tasks`
  behavior must remain valid.
- Operational: session locking must protect hydration and Markdown projection
  updates together.
- Security/privacy: JSON exports must not store secrets or private prompt bodies
  by default.
- Security/privacy: command-error records must redact secret-looking values and
  avoid storing full unbounded stdout/stderr by default.

## 8) Acceptance

- `afol new` creates canonical Markdown/evidence session files.
- `afol start`, `afol evidence`, `afol done`, and `afol close` update JSON
  debug snapshots only when explicitly requested, not as normal source state.
- Lifecycle commands hydrate SQLite before rendering managed Markdown.
- `afol state validate` fails when materialized state is stale or managed
  Markdown diverges.
- `afol state sync` re-renders managed Markdown from materialized state.
- Human content outside managed blocks is preserved.
- Failed AFOL lifecycle commands write command-error records before returning
  non-zero, including the command, args, exit code when known, failure class,
  session/task when known, bounded output excerpt, and recovery hint.
- Existing workbench lifecycle tests remain green.

## 9) Risks and Tradeoffs

- Risk: dual Markdown/SQLite state causes temporary complexity -> Mitigation:
  Markdown/evidence is authoritative, SQLite carries source hashes and is
  rebuildable.
- Risk: old sessions fail strict validation unexpectedly -> Mitigation:
  require explicit state init/migration for old sessions and keep compatibility
  behavior separate.

## 10) Rollout and Lifecycle

- Start with hydration for new and recent sessions.
- Add migration/init for older sessions after schema tests are stable.
- Backout by leaving existing Markdown lifecycle untouched and disabling strict
  hydration checks for sessions without materialized state.

## 11) Verification Philosophy

- Add schema/migration tests for hydrated state.
- Add lifecycle tests proving command updates hydrate state and render Markdown.
- Add drift tests for managed block edits and preserved human notes.
- Add failure-path tests for `done -x`, parse errors, close rejection, and
  stale-state validation error logging.
- Run `bun run typecheck`, `bun test`, and `afol validate project --json`.
