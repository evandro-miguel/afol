---
doc_type: plan
id: 260618_1420_orchestrator-coordination-radar_plan_01
theme: orchestrator-coordination-radar
status: complete
owners:
- orchestrator
created_at: '2026-06-18T14:20:00-03:00'
updated_at: '2026-06-18T15:50:26-03:00'
roadmap_feature: F-07
parent_spec: 260618_1519_orchestrator-coordination-radar_spec-child_01
child_spec: 260618_1519_orchestrator-coordination-radar_spec-child_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  task: 260618_1420_orchestrator-coordination-radar_task_01
repo: agentic_start_folder
branch: main_dev
---

# Plan: orchestrator-coordination-radar

## Purpose / Big Picture

Build a compact AFOL coordination radar so an orchestrator can see open tasks in
current workbench sessions, identify planned/touched files, and pass warnings to
workers before assigning overlapping edits.

The result should be visible through a compact CLI surface and in orchestrator
context bundles. It must stay local, token-safe, warning-only, and backed by
existing AFOL workbench/index/mutation state.

## Progress

- [x] 2026-06-18 18:19Z - Added active child spec
  `.afol/adm/specs/260618_1519_orchestrator-coordination-radar_spec-child_01.md`.
- [x] 2026-06-18 18:20Z - Created governed AFOL session
  `260618_1420_orchestrator-coordination-radar`.
- [x] 2026-06-18 18:50Z - Dispatched implementation agents with disjoint file scopes.
- [x] 2026-06-18 18:50Z - Integrated returned changes and ran validation gates.

## Governance Context

- Roadmap feature: `F-07`
- Governing spec:
  `.afol/adm/specs/260618_1519_orchestrator-coordination-radar_spec-child_01.md`
- Related specs:
  - `.afol/adm/specs/260521_0070_local-state-index-and-event-log_spec_01.md`
  - `.afol/adm/specs/260521_0040_governance-workbench-system_spec_01.md`
  - `.afol/adm/specs/260612_context-routing-bundles-and-section-index_spec-child_01.md`
  - `.afol/adm/specs/260521_0080_safe-file-mutation-and-undo_spec_01.md`

## Current State

- Workbench index currently reads `.afol/wb/**` task boards in
  `cli/services/local-state/workbench-index.ts`.
- Existing task records include session, task id, state, owner, notes, source
  file, line, and touched timestamp.
- Task templates now have explicit `Files planned` and `Files touched` claims.
- Mutation records are stored in `.afol/data/mutations/mutations.jsonl` via
  `cli/services/mutations/journal.ts`.
- `afol session` currently supports list/bind/switch/unbind in
  `cli/commands/session.ts`.
- `ctx bundle` lives in `cli/services/context/bundler.ts` and can carry compact
  role-oriented metadata.

## Scope

In scope:

- Derive open task coordination state from non-archived `.afol/wb` sessions.
- Parse explicit `Files planned` and existing `Files touched` task checkpoints.
- Correlate mutation journal records by session/task to touched paths.
- Generate stable warning ids for path overlap, missing intent, missing owner,
  stale task context, and stale coordination index.
- Add compact and JSON CLI output under `afol session radar`.
- Add orchestrator-only coordination warnings to `afol ctx bundle`.
- Update source/downstream task templates so future workers declare planned
  file ownership before edits.
- Add targeted tests and run relevant gates.

Out of scope:

- Distributed locks or blocking edits.
- Guessing planned files from arbitrary prose.
- Cloud/remote session discovery.
- Collecting raw prompts, raw transcripts, or broad file contents.

## Plan of Work

T-01 owns the data layer. Add typed coordination models and warning generation
near the existing local-state workbench index, while keeping `workbench.json`
compatible for older consumers. Reuse mutation journal loading rather than
creating a second mutation parser.

T-02 owns the CLI surface. Add `afol session radar` in the existing session
command, expose compact rows by default, and return bounded envelope JSON with
open tasks and warnings under `--json`.

T-03 owns context/template projection. Add a small `COORDINATION-RADAR`
orchestrator hook contribution and update task templates in both template roots
with explicit `Files planned` and `Files touched` guidance.

T-04 validates after implementation agents return. It should run the smallest
targeted tests first, then the project gates required by the spec.

## Concrete Steps

1. Extend the workbench index/parser or add a local-state coordination service
   that returns `open_tasks`, `planned_files`, `touched_files`, and `warnings`.
2. Add tests for task checkpoint parsing, mutation correlation, and overlap
   warning generation.
3. Add `afol session radar` with compact default and `--json` output.
4. Add session command tests for no-session, open-task, overlap, and JSON
   output cases.
5. Add an orchestrator hook contribution so context bundles include radar
   guidance and tool hints for `role=orchestrator`.
6. Update `docs/templates/task.md` and
   `src/project-template/docs/templates/task.md`.
7. Regenerate template output if the repository requires it.
8. Run targeted tests, `afol local-state rebuild --json`,
   `afol validate project --json`, `bun run typecheck`, `bun test`, and
   `bun run validate:release`.

## Interfaces and Expected Files

- CLI:
  - `afol session radar`
  - `afol session radar --json`
- Service/types:
  - `cli/services/local-state/workbench-index.ts`
  - optional new service under `cli/services/local-state/` or
    `cli/services/orchestration/`
- Context:
  - `.agents/hooks/index.json`
  - `src/project-template/.agents/hooks/index.json`
- Templates:
  - `docs/templates/task.md`
  - `src/project-template/docs/templates/task.md`
- Tests:
  - `cli/tests/local-state-indexes.test.ts`
  - `cli/tests/session-command.test.ts`
  - `cli/tests/context-system.test.ts`
  - template policy tests if generated template files change

## Risks and Mitigations

- Risk: command output becomes too large -> Mitigation: compact rows, summary
  counts, top warnings, and bounded JSON.
- Risk: planned-file parsing is brittle -> Mitigation: explicit checkpoint
  labels and tests; no prose guessing.
- Risk: warnings look like hard locks -> Mitigation: wording says warning-only
  and handoff context.
- Risk: agents edit overlapping files -> Mitigation: disjoint delegated scopes
  and final integration review before validation.

## Validation and Acceptance

- Unit/targeted:
  - `bun test cli/tests/local-state-indexes.test.ts`
  - `bun test cli/tests/session-command.test.ts`
  - `bun test cli/tests/context-system.test.ts`
- Template:
  - `bun run validate:template`
- AFOL/project:
  - `afol local-state rebuild --json`
  - `afol validate project --json`
  - `bun run typecheck`
  - `bun test`
  - `bun run validate:release`
- Behavioral acceptance:
  - `afol session radar` shows open tasks from non-archived sessions.
  - `afol session radar --json` includes bounded warnings and file claims.
  - An orchestrator `ctx bundle` contains `COORDINATION-RADAR` guidance and
    radar tool hints when relevant.

## Idempotence and Recovery

- Parsing/index rebuild work must be safe to run repeatedly.
- CLI output should be derived from source workbench state and mutation logs.
- If template generation changes generated files, rerun the project template
  validation and keep generated output in sync.
- If a validation step fails from unrelated pre-existing state, capture the
  exact command and isolate it before changing more code.

## Completion Gate

- [x] T-01, T-02, T-03, and T-04 have task-scoped evidence.
- [x] Spec acceptance bullets are covered by tests or explicit evidence.
- [x] Workbench/index state is rebuilt after docs/spec/template changes.
- [x] Final diff contains no legacy `.agents` command-system resurrection.
