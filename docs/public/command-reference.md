# Command reference

`afol help` is the live catalog. `afol help --json` includes stability
(`stable`, `experimental`, `compatibility`), aliases, and side effects.
`afol help <command>` documents one command.

Everyday aliases: `s` status, `n` new, `st` start, `d` done, `c` close,
`qt` quick-task, `v` validate, `up` update.

## Lifecycle

```text
afol init
afol s
afol qt <theme> -t "<task>" -c "<check>"
afol n <theme> -t <text>
afol st T-01
afol e T-01 -c "<check>" -o passed
afol d T-01 -x "<argv-only-check>"
afol c
```

Long forms remain valid. `d -x` / `done --test` is the agent-facing default: it
runs argv-only verification and records observed evidence without shell parsing.
`done --test-shell` runs one shell command for a local operator only; never use
it for agent or remote/provider execution. Completion without observed evidence
is rejected. Use `e T-01 -c "<check>" -o passed` when recording a separate
evidence receipt.

## Materialized state

Hydrate a session before inspecting or exporting its derived state:

```text
afol hydrate --session <session-id>
afol state show --session <session-id>
afol state validate --session <session-id>
afol state sync --session <session-id>
afol state export --session <session-id>
```

`state show` reads the snapshot, `state validate` checks its source hashes,
`state sync` refreshes the snapshot, and `state export` prints the hydrated
snapshot. Omit `--session` only when an active or bound session is available.

## Project and template

```text
afol bootstrap <target>
afol validate project
afol update check
afol update preview
afol update apply --dry-run
afol catchup --fix
```

## Stability

- **stable**: init, bootstrap, status, health, new/start/done/close, evidence,
  state, validate, update, safe file mutations.
- **experimental**: evolve, fleet, memory, library, bench,
  project-benchmark, telemetry, receipt, adapter, hydrate, ux.
- **compatibility**: `legacy`, `render`. Do not use these for new work.

Experimental commands may change between alpha releases.
