---
description: Compact AFOL tool and command surface for agents.
metadata:
  tags: "agentic-folder-sys, afol, tools, commands, workbench, validation"
---

# AFOL Tools And Commands

Use this when you need to know which AFOL command to call. Keep output compact
unless a concrete conflict requires detail.

## Discovery And State

```bash
pwd
git status --short --branch
afol status
afol validate project
```

Use these before edits, commits, pushes, scaffold updates, or when repo state is
unclear.

When command names or side effects are uncertain, inspect the registry-backed
surface instead of relying on memory:

```bash
afol help --json
afol help <command>
```

The retained static catalog is `.afol/adm/tools.json`. Treat it as a compact
discoverability mirror of the live help registry, not as a separate source of
truth.

## Workbench Lifecycle

Create or target a governed session:

```bash
afol new <theme> --task "<task 1>" --task "<task 2>"
afol start --session <session-id> --task-id T-01
```

Record evidence and close work:

```bash
afol evidence --session <session-id> --task-id T-01 \
  --command "<verification command>" --result passed
afol done --session <session-id> --task-id T-01
afol verify-tasks .afol/wb/<session-id> --strict
afol close --session <session-id>
```

Use explicit `--session` and `--task-id` in delegated or parallel work.

## Planning And Context

Use planning/context tools only when the task needs them:

```bash
afol preflight
afol local-state
afol pstr
afol ctx build
afol ctx bundle
afol ctx explain
afol hook
afol rule
afol skill
afol state
afol session
afol catchup
```

Planner agents should usually need `afol preflight`, `afol status`, and focused
file reads. They do not need benchmark commands unless the planned work is a
benchmark lane.

## Install, Bootstrap, And Update

Current repo:

```bash
afol init --provider-compatible --dry-run
afol init --provider-compatible
```

Explicit target repo:

```bash
afol bootstrap /path/to/project --provider-compatible --dry-run
afol bootstrap /path/to/project --provider-compatible
```

Update installed scaffold:

```bash
afol update check
afol update preview
afol update apply --dry-run
```

Use verbose output only for a specific conflict.

## Validation Levels

Small docs or skill-only change:

```bash
afol validate project
```

Project code/config change:

```bash
<project-local typecheck/test command>
afol validate project
```

Scaffold state or index drift:

```bash
afol local-state rebuild --json
afol validate project --json
```

Open [Benchmarking](./benchmarking.md) only when the task actually touches
benchmarks or token budgets.

## Health, Doctor, And Telemetry

Use these when status or validation reports drift, stale indexes, session
confusion, or benchmark questions:

```bash
afol health
afol doctor
afol telemetry
afol project-benchmark
```

Keep output compact; use command-specific help before adding verbose flags.

## File And Recovery Helpers

Use `afol file` or `afol f` for supported reversible file operations when the
repo provides that subcommand. Prefer AFOL archive/mutation journals over ad hoc
deletes. For recovery, start with [Troubleshooting](./troubleshooting/README.md).
