---
description: Role-scoped guidance for agents that create or review AFOL execution plans.
metadata:
  tags: "agentic-folder-sys, afol, planning, plan, workbench, agents"
---

# AFOL Planning Guidance

Use this only when your task is to create, review, or repair an execution plan.
Do not load execution, benchmark, or install details unless the plan's scope
requires them.

## Planner Inputs

Before writing a plan:

1. Read local `AGENTS.md`.
2. Read `.agents/config.json` for AFOL paths.
3. Check `git status --short --branch`.
4. Gather only the files, commands, errors, and constraints needed to make the
   plan executable.

If the user asked for planning-only, do not edit product files and do not create
workbench artifacts unless they explicitly asked for a durable artifact.

## What A Good Plan Contains

Use [Plan Template](./templates/plan.md) when a durable plan is needed.

Include:

- objective and non-goals;
- exact target files or surfaces;
- task sequence that an executor can start now;
- risks and rollback/recovery path;
- validation commands and expected pass/fail meaning;
- which skills/references each executor should load.

Avoid:

- phases whose only purpose is "make another plan";
- broad research when a focused file read or command can decide the issue;
- benchmark details unless the work touches benchmark or release-readiness;
- generic "run tests" without naming the narrowest useful command.

## Plan Shape For Delegated Work

For each task, state:

- owner role: planner, executor, reviewer, benchmark, or docs;
- allowed files and forbidden surfaces;
- required skills/references;
- command evidence expected;
- whether the agent may edit or is read-only.

Example:

```markdown
- T-02 executor: update `cli/services/health/**`.
  Skills/references: agentic-folder-sys execution, tools.
  Forbidden: `.agents/runtime`, `.agents/scripts`, unrelated skills.
  Validate: `bun test cli/tests/health-system.test.ts`.
```

## When To Create A Workbench Session

Create a session for non-trivial implementation, migration, validation,
benchmark, or release work:

```bash
afol new <theme> --task "<direct executable task>"
```

Do not create a session for a tiny answer, a purely read-only explanation, or
the meta-task of deciding whether a plan should exist.

## Planner Closeout

Before handing off, verify the plan is executable:

- every task has a concrete action;
- no task requires hidden context;
- validation commands are named;
- auxiliary references are scoped;
- risks are specific enough for an executor to act on.
