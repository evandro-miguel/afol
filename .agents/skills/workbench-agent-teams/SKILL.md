---
name: workbench-agent-teams
description: Use when organizing agent collaboration in `.agents/wb/` with session folders, standardized documents, automation-aware workflows, and test-backed execution evidence.
metadata:
  category: system
  tags: "workbench, wb, agent teams, templates, documentation, orchestration, active-session, tools"
  triggers: "wb, workbench, session docs, plan template, task template, agent workflow, wb-update, verify-tasks"
---
# Workbench Agent Teams (Project-Local)

Use this skill to run multi-agent work with clear artifacts in `.agents/wb/`.

## When to Use

- You need a durable plan and execution trail for multiple agents.
- You want consistent templates for planning and reporting files.
- You need test evidence and decisions to stay easy to find.
- The repository already uses a richer `.agents` scaffold with active-session pointers, workbench automation, and governed delivery docs.

## Core Rules

- Workbench lives inside the project: `.agents/wb/`.
- Prefer the project-local scaffold when it exists instead of inventing a lighter ad-hoc layout.
- Every workbench `.md` file must include YAML frontmatter.
- Use one session folder per workstream: `YYMMDD_HHMM_<theme>/`.
- Use standardized file names: `YYMMDD_HHMM_<theme>_<type>_<number>.md`.
- If the scaffold provides `.agents/wb/.active_session`, treat it as the canonical active-session pointer.
- Keep test integrity: if code changed, run unit tests first, then E2E when available.
- Enforce task markers in workbench task files: `-[]` (pending), `-[/]` (in progress), `-[x]` (completed).
- If a plan exceeds 500 lines, split it into phases and create one task file per phase.
- Every agent must produce a report with problems found and solutions applied.
- Every plan must list critical Tools, MCPs, and Skills, and require executors to research additional critical dependencies before execution.
- For major workstreams, include the governance context the scaffold expects: roadmap/spec references, brainstorm, explorer-check, and a closure artifact such as postmortem when the repo supports them.
- Prefer automation for `updated_at`, task markers, status changes, timeline entries, and file lists when the scaffold provides `wb-update`.
- Plan/session verification is mandatory before closure. Prefer the repo's strict verifier over hand-waving completion claims.

## Directory Layout

See [Structure Reference](./references/structure/README.md) for complete conventions.

```text
.agents/
  wb/
    .active_session
    YYMMDD_HHMM_<theme>/
      YYMMDD_HHMM_<theme>_plan_01.md
      YYMMDD_HHMM_<theme>_task_01.md
      YYMMDD_HHMM_<theme>_brainstorm_01.md
      YYMMDD_HHMM_<theme>_explorer-check_01.md
      YYMMDD_HHMM_<theme>_spec-lite_01.md
      YYMMDD_HHMM_<theme>_report_01.md
      YYMMDD_HHMM_<theme>_log_01.md
      YYMMDD_HHMM_<theme>_research_01.md
      YYMMDD_HHMM_<theme>_postmortem_01.md
      packs/<pack-slug>/
```

Some repositories still add helper folders such as `.lock/`, but the starter-folder scaffold is primarily pointer-driven through `.active_session`.

## Templates

- [Template Index](./references/templates/README.md)
- [Plan Template](./references/templates/plan.md)
- [Task Template](./references/templates/task.md)
- [Brainstorm Template](./references/templates/brainstorm.md)
- [Explorer Check Template](./references/templates/explorer-check.md)
- [Spec Lite Template](./references/templates/spec-lite.md)
- [Spec Template](./references/templates/spec.md)
- [Blocks Template](./references/templates/blocks.md)
- [Report Template](./references/templates/report.md)
- [Log Template](./references/templates/log.md)
- [Research Template](./references/templates/research.md)
- [Postmortem Template](./references/templates/postmortem.md)

The richer scaffold also uses neighboring workstream artifacts such as `spec.md`, `spec-lite.md`, and `blocks.md` when delivery needs local specification or extra coordination.

## Tools

- [Workbench Tools Reference](./references/tools.md)

Use the repository automation when available:

- `.agents/agents tools list` to discover workbench-capable commands from `.agents/tools.json`
- `.agents/agents new ...` to create governed sessions and update `.active_session`
- `.agents/agents wb-update ...` or `make wb-*` for timestamp, task, status, timeline, links, files-changed, and evidence automation
- `.agents/agents verify-tasks <session>` for completion checks
- `.agents/agents status` and `.agents/agents session catchup|close` for lifecycle control
- `.agents/agents knowledge ...` before re-reading large historical workbench docs

## Workflow

1. Create or target the session through the scaffold, ideally with `.agents/agents new ...` so `.active_session` stays accurate.
2. Start with `plan` and `task`, then add `brainstorm` and `explorer-check` for major work before execution.
3. Add `research`, `spec-lite`, `spec`, or `blocks` only when they materially improve clarity or governance.
4. Execute work and record traceable progress in `log` files.
5. Use `wb-update` automation instead of hand-editing timestamps and status when the scaffold supports it.
6. Run strict session verification such as `verify-tasks --strict`, plus repo lint/review gates where available.
7. Close with `report` and, for major governed workstreams, a `postmortem`.

## Parallel Coordination

Keep concurrency <= 3 **subagents**. The primary assistant acts as orchestrator.

- Orchestrator: owns session structure, active-session context, and task flow.
- Worker: implements changes and moves tasks to `ready_for_test`.
- Tester: runs tests and writes evidence in report/log files.
- Researcher/Explorer: supports unknowns with focused investigation docs.

See [Workflow Reference](./references/workflow/README.md) for the state machine, automation preferences, and closure flow.
See [Governance Reference](./references/governance/README.md) when the repo uses roadmap/spec-driven delivery.

## Common Mistakes

- Missing frontmatter in workbench markdown files.
- Naming files without timestamp or sequence number.
- Ignoring `.active_session` and updating the wrong session by hand.
- Editing `updated_at` manually when the project provides `wb-update touch`.
- Skipping brainstorm or explorer-check on major work, then planning from assumptions.
- Running tester against tasks that are not `ready_for_test`.
- Writing reports without command/result/evidence.
- Finalizing a session without a closure artifact when the scaffold expects postmortem/session-close flow.

## Validation

- Confirm every workbench markdown file has YAML frontmatter.
- Confirm file names follow `YYMMDD_HHMM_<theme>_<type>_<number>.md`.
- Confirm `plan` and `task` files exist for every active session.
- Confirm `.active_session` points to the intended session when the scaffold uses it.
- Confirm major workstreams have `brainstorm` and `explorer-check` before plan finalization.
- Confirm reports include unit/E2E execution evidence when code changed.
- Confirm `verify-tasks` or equivalent session checks pass before closure.
