# Command reference

`afol help` is the live catalog. `afol help --json` includes stability
(`stable`, `experimental`, `compatibility`), aliases, and side effects.
`afol help <command>` documents one command.

Everyday aliases: `s` status, `n` new, `st` start, `d` done, `c` close,
`qt` quick-task, `v` validate, `up` update.

## Lifecycle

Happy path (omit `--session`/`-S` when an active or bound session resolves):

```text
afol init
afol s
afol qt <theme> -t "<task>" -c "<check>"
afol n <theme> -F <F-id> -P <spec-id> -t "<task>"
afol st T-01
afol d T-01 -x "<check>"
afol c
```

`qt` is the 1-hop micro path (create → start → one verify → done → close).
`n` → `st` → `d -x` → `c` is the governed path. `d -x` / `done --test` is the
agent-facing default: argv-only verification plus observed evidence, no shell
parsing. `true`, `:`, and other shell no-ops cannot authorize done. Missing
`-x` is rejected. `done --test-shell` is local-operator-only; never use it for
agent or remote/provider execution.

`e` is diagnostic only (a separate evidence receipt without completing). Do not
teach `e` on the happy path. Pass `-S <session-id>` only for CI or multi-agent
when the session is ambiguous.

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
