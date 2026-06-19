---
doc_type: spec-child
id: 260618_1519_orchestrator-coordination-radar_spec-child_01
theme: orchestrator-coordination-radar
status: active
owners:
- orchestrator
created_at: '2026-06-18T15:19:49-03:00'
updated_at: '2026-06-18T15:19:49-03:00'
roadmap_feature: F-07
spec_role: child
parent_spec: 260521_0070_local-state-index-and-event-log_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260521_0070_local-state-index-and-event-log_spec_01.md
  related:
  - .afol/adm/specs/260521_0040_governance-workbench-system_spec_01.md
  - .afol/adm/specs/260612_context-routing-bundles-and-section-index_spec-child_01.md
  - .afol/adm/specs/260521_0080_safe-file-mutation-and-undo_spec_01.md
scope:
  repo_areas:
  - .afol/wb
  - .afol/data/index
  - .afol/data/mutations
  - cli/services/local-state
  - cli/services/context
  - cli/commands
  - .afol/adm/hooks
  - docs/templates
  - src/project-template/.afol/adm/hooks
  - src/project-template/docs/templates
  packages:
  - agentic-cli
risk_level: medium
---

# SPEC CHILD: orchestrator-coordination-radar

## 1) Feature Intent

- Outcome: AFOL gives orchestration agents a compact radar of open work across
  current workbench sessions, including which files each task is touching or
  intends to touch.
- Why now: Multi-agent orchestration needs situational awareness outside the
  current chat/session so one orchestrator can avoid assigning conflicting file
  ownership and can add context warnings before workers start.
- Roadmap feature: `F-07`
- Parent spec: `260521_0070_local-state-index-and-event-log_spec_01`

## 2) Problem

An orchestrator can see the current session, but not the practical collision
surface created by other open sessions and delegated agents. Existing workbench
tasks have task state and a `Files touched` checkpoint, while mutation journals
record actual file operations, but AFOL does not expose a single compact view
that answers:

- what plans/sessions have open tasks now,
- who owns them,
- which files are declared as planned work,
- which files were already touched by task evidence or mutation journals,
- which warnings matter before assigning or starting another worker.

Without that view, agents over-read workbench folders, miss conflicts, or learn
about overlapping edits only after implementation.

## 3) Users and User Journey

Primary users:

- orchestrators assigning work across several agents,
- workers receiving a task handoff that should name risky neighboring work,
- reviewers checking whether conflicts were considered before merge/close.

User journey:

1. An orchestrator runs a compact AFOL command before delegating work.
2. AFOL scans the derived workbench index and mutation journal, then returns
   open tasks from non-archived sessions.
3. Each task row includes session, task id, state, owner, age/freshness,
   planned files, touched files, source/confidence, and warning ids.
4. The orchestrator passes relevant warnings into worker handoffs.
5. `afol ctx bundle` can include the same coordination warnings for
   orchestrator-oriented bundles without loading full plans or all tasks.

## 4) Experience and Behavior

Expected behavior:

- A compact command, tentatively `afol session radar`, lists open tasks across
  current workbench sessions.
- `--json` returns a bounded machine-readable payload for orchestrators and
  agents.
- Default output is compact and token-safe: summary counts, highest-severity
  warnings, and one concise row per open task.
- The command uses `.afol/data/index/workbench.json` where fresh and can rebuild
  or warn when stale depending on existing local-state policy.
- Planned files are explicit task claims, not guessed from prose. The task
  template gains a `Files planned` field for future sessions.
- Touched files come from the task implementation checkpoint and the
  `.afol/data/mutations` journal when records have session/task references.
- Path entries preserve source and confidence:
  `planned`, `touched`, `mutation`, `evidence`, or `unknown`.
- Path matching is repo-relative and normalized; globs are allowed for planned
  claims, but warnings distinguish exact path overlap from broad glob overlap.
- Context bundles for orchestration roles expose a small
  `COORDINATION-RADAR` hook message and radar tool hints, and omit them for
  unrelated roles unless explicitly requested.

Boundaries:

- This is local situational awareness, not a lock manager.
- AFOL should warn about possible overlap; it must not block edits unless a
  later spec explicitly adds enforcement.
- No private prompts, raw chat transcripts, secrets, or broad file contents are
  collected.
- `.afol/wb/.active_session` remains convenience state only; multi-agent
  commands and reports must preserve explicit session/task identities.

## 5) Scope

In scope:

- Extend workbench task indexing with planned file claims and existing touched
  file checkpoints.
- Correlate safe-file mutation journal records with session/task tasks.
- Add a compact orchestration radar command under the AFOL CLI.
- Add warning generation for likely orchestration conflicts and missing context.
- Add coordination warning/reminder context hooks for orchestrator use.
- Update task templates in both source and downstream project template.
- Add targeted tests for parsing, warning generation, CLI output, and context
  bundle inclusion.

Out of scope:

- Distributed locks, daemonized coordination, cloud sync, or remote session
  discovery.
- Automatic merge conflict prevention.
- Guessing planned files from arbitrary task prose.
- Storing raw prompts or command output beyond existing bounded evidence
  contracts.

## 6) Warning Contract

Warnings should be short, stable ids with human-readable messages and affected
session/task/path references. Initial warning ids:

- `path_overlap_planned`: two open tasks declare the same planned file or
  overlapping planned glob.
- `path_overlap_touched`: an open task intends to touch a path already touched
  by another open task/session.
- `mutation_overlap`: mutation journal shows a write/move/archive/patch under a
  path another open task has planned.
- `missing_file_intent`: an `in_progress` task has neither planned files nor
  touched files, so ownership is unclear.
- `stale_task_context`: an open task has not been touched recently enough to be
  trusted without refresh.
- `missing_owner`: an open task lacks a useful owner in the state board.
- `stale_coordination_index`: the derived index is stale or missing and output
  may be incomplete.

The warning payload should include severity (`info`, `warning`, `critical`),
reason, affected tasks, affected paths, source, and a recovery hint.

## 7) Acceptance

- `afol session radar` reports open tasks across non-archived sessions without
  requiring full workbench scans in agent context.
- `afol session radar --json` returns bounded JSON with sessions, tasks,
  planned files, touched files, warning ids, and freshness metadata.
- Tasks with a `Files planned` checkpoint are parsed into the workbench index.
- Existing `Files touched` checkpoints continue to work and are parsed without
  breaking older tasks.
- Mutation journal records are correlated by session/task and contribute touched
  paths when present.
- At least one test proves overlap warnings across two open sessions.
- `afol ctx bundle` can include `COORDINATION-RADAR` hook guidance and radar
  tool hints for orchestrator context without exceeding the compact bundle
  budget.
- New task templates ask agents to declare planned file ownership before edits
  and touched files after edits.
- Existing `afol status`, `afol session list`, `afol local-state rebuild`,
  template validation, and release validation do not regress.

## 8) Risks and Mitigations

- Risk: agents treat warnings as hard locks -> Mitigation: copy and docs call
  them warnings/context only.
- Risk: broad globs create false positives -> Mitigation: distinguish exact and
  glob overlap and keep severity lower for broad matches.
- Risk: parsing task Markdown becomes brittle -> Mitigation: add explicit
  checkpoint labels and preserve backward compatibility for old `Files touched`.
- Risk: output gets token-heavy in large workbenches -> Mitigation: default
  compact rows, top warnings, and bounded JSON summaries.

## 9) Verification Philosophy

- Add focused unit tests around task checkpoint parsing and warning generation.
- Add CLI tests for default and JSON radar output.
- Add context bundle tests or live bundle evidence proving orchestrator
  coordination guidance is included only when relevant.
- Run `afol local-state rebuild --json`, `afol validate project --json`,
  `bun run typecheck`, targeted `bun test`, and `bun run validate:release`
  before closeout.
