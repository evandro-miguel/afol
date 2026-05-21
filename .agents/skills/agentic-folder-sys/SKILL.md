---
name: agentic-folder-sys
description: Use when installing, upgrading, validating, or operating this project-local `.agents` scaffold, including bootstrap, skills-sync, runtime MCP inspection, workbench sessions, task/report/log artifacts, and closure evidence.
metadata:
  category: agentic
  tags: "agentic-folder-sys, agentic-system, workflow, bootstrap, scaffold-update, upgrade, skills-sync, workbench, wb, runtime, mcp, git, validation"
  triggers: "agentic folder sys, agentic-folder-sys, .agents scaffold, bootstrap repo, install scaffold, scaffold-update, stable scaffold update, update framework, upgrade scaffold, skills-sync, universal-skills, runtime manifest, runtime validate, scaffold mcp, workbench, wb-update, verify-tasks, reporting, planning, execution"
  references: "core, patterns, troubleshooting, workbench, templates, gotchas"
  version: "1.0.10"
  updated_at: "2026-05-15T14:35:00Z"
  target_provider: universal
---

# Agentic Folder Sys

Use this as the single operational entrypoint for the repo-local `.agents`
folder system. It merges the scaffold lifecycle workflow and the governed
workbench workflow so agents do not route through two overlapping skills.

## First Decision

If a request is governed implementation, validation, or delivery, the first
mutable repository state should be the governed workbench session/task state,
not the product file. Use the scaffold wrapper to discover and perform that
state transition, then make the product change. If the request is planning-only
or read-only, avoid creating `.agents/wb/` artifacts.

## Non-Negotiable Governed Delivery Gate

For any governed request that includes implementation, validation, or delivery,
the workbench workflow is part of the work, not documentation after the fact.
Run this sequence before product completion can be claimed:

1. Create or target a session under `.agents/wb/` with `./.agents/agents new
   <theme> --feature-id <F-id> --parent-spec <spec-id>`.
2. Move the execution task to in_progress with `./.agents/agents implement start
   --session <session-id> --task-id T-01` or the equivalent `wb-update task ...
   --mark-in-progress`.
3. Only then edit product files.
4. Run the requested verification command.
5. Close the task with `./.agents/agents implement complete --session
   <session-id> --task-id T-01 --command "<verification command>" --result
   passed --artifact <path-or-report>` or record evidence with `wb-update
   evidence` and then use `wb-update task ... --mark-done --evidence-id <E-id>`.

If step 1 or step 2 fails, stop and fix the workflow blocker before editing the
product. Do not create tasks already marked `[x]`, do not manually edit
`.evidence.jsonl`, and do not claim `plan_created`, `task_completed`,
`evidence_recorded`, or `used_governed_session` unless the corresponding files
and command-created state exist under `.agents/wb/<session-id>/`.

## Artifact Economy Gate

Workbench files are not scratch notes. Do not create a session, plan, task,
research, brainstorm, explorer-check, log, report, spec, or postmortem just to
think, save context, or satisfy habit. Create or update `.agents/wb/` only when
the current work needs governed execution, durable evidence, or a durable
decision record.

If the user asks only for a plan, answer in the conversation unless they also
ask for a durable governed artifact. If a governed session is warranted, start
with `plan` + `task`; add optional artifacts only when requested, required by a
rule for the actual work, or needed as the smallest blocking proof before safe
execution. Reuse the active relevant session instead of creating a sibling
session for the same work.

## Decision Tree

Need to install or upgrade the scaffold in another repo?

- Start with [Core](./references/core/README.md)

Need the git-backed skill refresh or upstream PR proposal flow?

- Open [Patterns](./references/patterns/README.md)

Need to verify, recover from drift, or resolve a failed operation?

- Open [Troubleshooting](./references/troubleshooting/README.md)

Need compact runtime/MCP inspection, validation, safe archive, reversible write,
patch, or undo inside the scaffold?

- Use the Runtime MCP Lane below.

Need to organize a governed `.agents/wb/` session?

- Use the workbench rules below and start from the
  [plan](./references/templates/plan.md) and
  [task](./references/templates/task.md) templates.

Before finalizing, scan [Gotchas](./gotchas.md).

## Behavioral Guidelines

These guidelines reduce common LLM coding mistakes. They bias toward caution
over speed; for trivial tasks, use judgment.

- Think before coding: state assumptions, surface multiple interpretations, and
  ask when material confusion remains. Do not silently pick an ambiguous path.
  Simplicity first: write the minimum code or documentation that solves the
  request. Do not add speculative features, single-use abstractions, or
  unrequested configurability. Surgical changes: touch only lines that trace to
  the user's request. Match the existing style, clean up only unused code
  introduced by the current change, and mention unrelated dead code instead of
  deleting it. Goal-driven execution: turn work into verifiable outcomes. For
  multi-step work, use a brief plan where each step includes its verification
  check. Loop until evidence proves the requested behavior or a concrete blocker
  is reached.

## Operating Rules

- Treat `./.agents/agents bootstrap` as the installer for this scaffold. Full
  bootstrap can create the target directory for a brand new repo. Use `bootstrap
  --partial` for existing projects so project-owned files stay intact. Keep
  project-owned repository docs outside `.agents/`; use `docs/map/` for
  current-state repository mapping and analysis evidence. Treat git as the
  upstream source of truth for universal-skills, but keep that checkout outside
  the project scaffold. Treat `.agents/source/universal-skills` as the
  repo-local seed inside each project; it must not be a nested git checkout.
  Treat `skills-sync pull` as source refresh only. Use `skills-sync sync` or
  `skills-sync update` to actually refresh `.agents/skills/`. Use
  `scaffold-update --channel stable --source <verified-source>` for
  scaffold-owned `.agents` file updates only after inspecting `--plan-only` or
  `--diff-only`; mutation requires explicit `--apply`, verified channel
  metadata, allowlisted payload paths, backup, validation, and rollback. Use
  `skills-sync push` only as a branch/PR proposal flow from an external
  universal-skills checkout; never push directly to universal `main`. Prefer
  `make agents-all` in adopted repos when the project already owns `make all`.
  Treat skill and profile identifiers as single path components: reject empty
  values, absolute paths, path separators, NUL bytes, `.`, and `..` before
  applying, syncing, or proposing skills. Workbench lives at `.agents/wb/`; keep
  one session folder per workstream. Treat `.agents/wb/.active_session` as local
  operator state. It is a project-local convenience pointer, not shared
  synchronization for parallel agents. Use `AGENTS_SESSION_ID=<session-id>` when
  the shell or wrapper honors the session context contract. Use
  `AGENTS_SESSION_STRICT=1` when you need to reject repository-global
  active-session fallback in strict or parallel contexts. Keep session
  management per project: list sessions with `./.agents/agents session list`,
  sweep stale or overlapping sessions with `./.agents/agents session sweep` as a
  read-only pass, resume with `./.agents/agents session catchup --session
  <session-id>`, and close with `./.agents/agents session close --session
  <session-id>`. Do not treat this as a global multi-project dashboard or index.
  Use standardized workbench artifacts: `plan`, `task`, `log`, and `report`. For
  major work, `brainstorm`, `research`, `explorer-check`, and `postmortem` are
  optional companion artifacts when they materially help the workstream, but
  they are not plan phases by default. A `plan` artifact describes the direct
  execution path for the requested work; it must not contain tasks whose only
  purpose is to prepare a later plan, do generic research, or gather broad
  context. Do needed discovery before authoring the plan and fold findings into
  facts, assumptions, risks, scope, sequencing, and validation. If the user asks
  for more research to make a plan stronger, update those plan sections; create
  a research artifact only when research is itself the deliverable or the
  smallest blocking proof before safe execution. Before touching any file or
  artifact, resolve the applicable rule, standard, template, skill, and spec for
  that element. Apply all cumulative guidance for the element type and work
  intent, such as TypeScript plus feature plus spec. Tasks are executable units,
  not planning theater: each task should describe a concrete action an agent can
  take now, and deferred work must be marked `moved` with destination plus
  reason instead of a generic skip. For governed feature execution, prefer
  `./.agents/agents implement ...` because it should surface the active
  feature/spec/rule bundle before task transitions run. For ambiguous,
  product-shaped, benchmark-heavy, or prioritization-heavy work, run the
  smallest useful decision-intake lane before creating plans, delegating agents,
  benchmarking, or implementing. Treat it as a ladder, not a mandatory pipeline.
  For every feature addition or meaningful feature behavior change, update the
  affected project-local skill under `.agents/skills/` and the affected project
  docs. Pending: mirror behavior-changing edits in this skill back to
  universal-skills through the approved branch/PR flow. Prefer `./.agents/agents
  wb-update ...` over manual timestamp, task-state, evidence, and file-list
  edits. Never create new tasks already marked `[x]` or `done`; seed them as
  `pending` unless execution has started. Mark tasks `[x]` only through
  task-scoped `.evidence.jsonl` closure evidence, a valid `evidence_id`, passing
  required gates, no unresolved blocking failed evidence, and strict
  verification. Verify behavior with repo commands before reporting completion.

## Workbench Workflow

Mandatory order for governed execution:

1. Create or target the `.agents/wb/` session before implementation edits.
2. Move the relevant task to `in_progress` before changing product files.
3. Implement the smallest scoped change.
4. Run the required validation command.
5. Record task-scoped evidence with command, result, and artifact/note.
6. Move the task to `done` only through the returned evidence id.

If session creation or task transition fails, stop and fix that blocker before
editing product files. Do not patch the product first and backfill workbench
state afterward.

Session command quick reference:

- `session list`

- `session sweep`

- `session catchup --session <session-id>`

- `session close --session <session-id>`

Verification rule:

- Use canonical task markers: `[ ]` pending, `[/]` in_progress, `[!]` problem,
  `[>]` moved, `[%]` implemented_untested, `[&]` tested_needs_spec_validation,
  `[x]` done. Mark tasks done only after evidence exists. Set `[x]` only after
  task-scoped closure evidence exists in `.evidence.jsonl` and the task
  references a valid evidence id. Use `[%]` and `[&]` for intermediate delivery
  states. If a required command fails, a sync drift remains, or a blocker is
  discovered, keep the task in `[!]`/`problem` until the blocker is resolved or
  explicitly moved to another plan. Do not close a task by treating a failed
  gate as a successful readiness check.

1. Create or target a session through `./.agents/agents new ...` so
   `.active_session` stays aligned for the local operator fast path. Session
   state must live under the repo's `.agents/wb/`; do not create, reuse, or
   point `--into-session` at `/tmp` or any path outside `.agents/wb/`.
2. Keep `roadmap_feature` and `parent_spec` context on major workstreams.
3. Run the smallest useful decision-intake lane when the request needs problem
   framing, challenge, benchmark order, qualitative prioritization, optional
   scoring, or fixed-appetite slicing.
4. Resolve the applicable rules for each element the workstream will touch.
5. For feature work, keep local skills and docs in sync with behavior changes
   and leave a universal-skills propagation pending item.
6. Start with `plan` and `task`; add `brainstorm`, `research`, or
   `explorer-check` only when they are the requested deliverable or the smallest
   blocking proof needed before safe execution.
7. Execute the change and record progress in `log`.
8. Record validation with `./.agents/agents wb-update evidence ...`.
9. Run repo checks and strict session verification before closure.
10. Close with `report`; if `brainstorm`, `research`, `explorer-check`, or
    `postmortem` exist, finalize them before closure.
11. If a `postmortem` exists, complete its governance-promotion review before
    setting `status=final`.

## Runtime MCP Lane

Use this lane for fast, bounded repository maintenance inside the scaffold. It
is part of `agentic-folder-sys`; do not create a separate skill for it.

Start sequence:

1. Run `generate_manifest` or `./.agents/agents runtime manifest`.
2. Run `search_docs` or `./.agents/agents runtime search "<query>"` for roadmap,
   spec, rule, docs/map, workbench, or skill context.
3. Run `validate_structure` or `./.agents/agents runtime validate`.
4. Only then mutate files.
5. Prefer `archive_paths` over delete.
6. Use `undo_last_change` if validation regresses.

Runtime tool surface:

- `inspect_workspace`: compact repository tree without broad context expansion.
  `search_docs`: search `docs/`, `docs/arc/`, `docs/map/`, `docs/knowledge/`,
  `docs/agentic/`, `.agents/wb/`, and `.agents/skills/`. `validate_structure`:
  detect missing scaffold folders, templates, and runtime docs; use
  `auto_fix=true` only when creating missing directories is intended.
  `generate_manifest`: summarize repository surfaces, scripts, skills, runtime
  docs, tool catalog size, search roots, and blocked write roots.
  `archive_paths`: move stale paths into `.agents/z-arq/<timestamp>_<slug>` and
  record undo metadata. `write_text_file`: deterministic file creation or
  replacement when final content is already known. `apply_unified_diff`: precise
  patch application. `undo_last_change`: revert the latest archive, write, or
  patch operation.

CLI fallback:

```bash
./.agents/agents runtime manifest
./.agents/agents runtime validate
./.agents/agents runtime search "roadmap"
./.agents/agents mcp inspect --depth 2
./.agents/agents-mcp manifest
```

Resources exposed by the runtime include `repo://manifest`, `repo://validation`,
`repo://tool-catalog`, and `skill://...` entries from `.agents/skills/`.

## Workbench Artifacts

- For this skill, workbench artifacts must follow `docs/standards/file-first-chat-light.md`.
- Mandatory output fields in plan/task/report templates:
  `output_artifacts` and `sidecar_justification`.
- Set sidecar justification to `not_required` for intentionally skipped optional
  artifacts.
- Return completion handoffs in compact format with:
  `STATUS`, `TASK`, `FILES_WRITTEN`, `VALIDATION_OR_CHECKS`, `SUMMARY`,
  `BLOCKERS`, and `NEXT`.

Minimum artifact set:

- `plan`

- `task`

- `log`

- `report`

Common optional companion artifacts:

- `brainstorm` `explorer-check` `research` `spec` or `spec-child` `spec-test`
  for test-focused strategy work `spec-lite` as a legacy compatibility alias
  `blocks` `postmortem` - Optional final closure artifact that records which
  optional artifacts existed, whether they were finalized, and whether the
  session should promote a lesson, rule, ADR/decision, or skill/doc follow-up

Task state contract:

- `pending`: not started `in_progress`: actively being executed `problem`: a
  real blocker exists `moved`: deferred to a later plan/session, with
  destination plus reason `implemented_untested`: implementation is in place,
  validation has not run `tested_needs_spec_validation`: validation passed, but
  spec/UX/acceptance validation is still pending `done`: finished, with passing
  evidence or explicit `N/A` when validation does not apply

Use templates from `./references/templates/` when creating or repairing
workbench files.

## Validation

```bash
./.agents/agents skills-sync check --skills agentic-folder-sys
./.agents/agents verify-tasks --strict .agents/wb/$(cat .agents/wb/.active_session)
make lint
```
