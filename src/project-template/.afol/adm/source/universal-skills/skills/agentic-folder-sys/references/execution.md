---
description: Role-scoped guidance for agents executing AFOL plans and recording evidence.
metadata:
  tags: "agentic-folder-sys, afol, execution, workbench, evidence, tasks"
---

# AFOL Execution Guidance

Use this when executing an approved AFOL plan or a direct implementation task.
Planner-only agents should not need this file.

## Execution Setup

1. Read local `AGENTS.md`.
2. Read `.agents/config.json`.
3. Check branch and dirty state.
4. Identify unrelated dirty files and leave them alone.
5. Start the assigned task before editing:

```bash
afol start --session <session-id> --task-id <task-id>
```

If there is no session and the work is non-trivial, create one:

```bash
afol new <theme> --task "<task>"
afol start --session <session-id> --task-id T-01
```

## Execution Loop

Use this loop for each task:

1. Inspect exact files and commands.
2. Make the smallest safe edit.
3. Run the narrowest relevant check.
4. Record evidence:

```bash
afol evidence --session <session-id> --task-id <task-id> \
  --command "<command>" --result passed
```

After evidence exists, mark the task done:

```bash
afol done --session <session-id> --task-id <task-id>
```

When all tasks are done, close the session:

```bash
afol verify-tasks .afol/wb/<session-id> --strict
afol close --session <session-id>
```

## Evidence Rules

Evidence must describe what was actually checked:

- Use the exact command string.
- Mark `passed` only when the command passed or the expected failure was
  explicitly part of the check.
- For expected failures, write the command text with the expectation, for
  example `afol health --area pstr exits 1 as expected`.
- Do not manually edit `.evidence.jsonl` or task state files.

## Editing Boundaries

Allowed by default:

- project files directly in scope;
- `.afol/wb/<session-id>/**` for governed state through `afol`;
- the configured `paths.skills_dir` when updating project-local skills.

Avoid unless explicitly scoped:

- retired `.agents` runtime surfaces;
- unrelated dirty files;
- global `~/.codex/skills/**`;
- generated output unless the task explicitly owns it.

When generated output must be updated, say why and keep it scoped to the files
owned by the task.

## Validation Choice

Start narrow:

```bash
afol validate project
```

Add code checks only when code/config changed:

```bash
<project-local typecheck/test command>
```

Use benchmark validation only when the plan explicitly touches benchmark
surfaces.
