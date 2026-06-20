---
name: agentic-folder-sys
description: Use when installing, upgrading, validating, or operating AFOL project scaffolds, including `.agents` static metadata, `.afol` mutable state, workbench sessions, skills, plans, tasks, updates, evidence, and lifecycle checks.
metadata:
  category: agentic
  tags: "agentic-folder-sys, afol, scaffold, bootstrap, init, provider-compatible, update, skills, workbench, plans, tasks, evidence, validation, lifecycle"
  triggers: "agentic folder sys, agentic-folder-sys, AFOL, afol install, afol init, afol bootstrap, bootstrap repo, install scaffold, update scaffold, upgrade scaffold, provider-compatible, workbench, plan, task, evidence, verify-tasks, skills, validation"
  references: "tools, planning, execution, delegation, benchmarking, core, patterns, troubleshooting, templates, template-index, gotchas"
  version: "1.2.0"
  updated_at: "2026-06-20T00:00:00Z"
  target_provider: universal
---

# Agentic Folder Sys

Use this as the operational entrypoint for AFOL-managed project scaffolds.
Current AFOL repos use `afol` as the only active front door.

## First Decision

Before writing:

1. Identify the repo root.
2. Read local `AGENTS.md`.
3. Read `.agents/config.json` when it exists.
4. Use configured `paths.*`; do not hardcode workbench, skill, temp, data, or
   event paths.

For governed implementation, validation, or delivery, the first mutable state is
the configured AFOL workbench session, normally `.afol/wb/`. Planning-only and
read-only requests stay in chat unless the user asks for durable governed
evidence.

## Load Only What Your Task Needs

Do not load every reference by default. Pick the smallest route:

| Your role or task | Read this | Skip unless needed |
| --- | --- | --- |
| Need the command surface or tool names | [Tools](./references/tools.md) | benchmark, install details |
| Create or review an execution plan | [Planning](./references/planning.md) and the [Plan Template](./references/templates/plan.md) | execution, benchmark, troubleshooting |
| Execute an approved plan | [Execution](./references/execution.md) and the [Task Template](./references/templates/task.md) | bootstrap/adoption details |
| Delegate to subagents | [Delegation](./references/delegation.md) | benchmark unless delegated task touches it |
| Install, adopt, or update AFOL in a repo | [Core](./references/core/README.md) | planning templates unless making a plan |
| Maintain project-local skills | [Patterns](./references/patterns/README.md#5-maintain-project-local-skills) | install cleanup sections |
| Map workflow artifacts to templates | [Templates Index](./references/templates/README.md) | individual templates until authoring that artifact |
| Run benchmark lanes | [Benchmarking](./references/benchmarking.md) | adoption cleanup sections |
| Recover from drift or failed AFOL commands | [Troubleshooting](./references/troubleshooting/README.md) | benchmark unless failure is benchmark-specific |

Before finalizing AFOL work, scan [Gotchas](./gotchas.md).

## Non-Negotiable Boundaries

- Use `afol` for every supported scaffold, workbench, validation, update,
  evidence, and lifecycle operation.
- Do not use, document, restore, or extend the retired `.agents/agents` Python
  wrapper, `.agents/scripts`, `.agents/runtime`, `.agents/wb` active state,
  `.agents/z-arq`, `agents.config`, `legacy:` routes, or delegate fallback.
- Keep `.agents/**` limited to static scaffold metadata and configured
  provider skill payloads such as `paths.skills_dir`.
- Keep mutable runtime state under configured AFOL paths, normally `.afol/**`;
  project-local skills follow `paths.skills_dir`.
- Pass explicit `--session` and `--task-id` when multiple agents or terminals
  may be active.
- Prefer compact/default command output. Treat a routine AFOL command emitting
  more than 5,000 output tokens as suspect and more than 10,000 as a bug.

## Minimal Command Set

Open [Tools](./references/tools.md) for the full command surface. The routine
compact set is:

```bash
afol status
afol validate project
afol new <theme> --task "<task>"
afol start --session <session-id> --task-id T-01
afol evidence --session <session-id> --task-id T-01 --command "<cmd>" --result passed
afol done --session <session-id> --task-id T-01
afol close --session <session-id>
```

Aliases are useful for known-good local workflows, but handoffs to other agents
should prefer explicit long flags.

## Output Contract

When reporting AFOL work, include only the relevant facts:

- changed paths;
- commands run and pass/fail status;
- session/task/evidence ids when governed;
- remaining dirty files outside your scope;
- any auxiliary surface intentionally left to targeted commands.

Do not paste raw logs when a command, result, and evidence id prove the same
point.
