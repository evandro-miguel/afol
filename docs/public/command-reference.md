# Command reference

`afol help` is the live catalog. `afol help --json` includes stability
(`stable`, `experimental`, `compatibility`), aliases, and side effects.
`afol help <command>` documents one command.

Everyday aliases: `s` status, `n` new, `st` start, `d` done, `c` close,
`qt` quick-task, `v` validate, `up` update.

## Lifecycle

```text
afol init
afol status
afol qt <theme> -t "<task>" -c "<check>"
afol new <theme> --task <text>
afol start <task-id>
afol evidence <task-id> --command <check> --outcome passed
afol done <task-id> --execute <check>
afol close
```

`done --execute` (alias `-x` / `--test`) runs the check and records observed
evidence. Completion without that evidence is rejected.

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
  validate, update, safe file mutations.
- **experimental**: evolve, fleet, memory, library, bench,
  project-benchmark, telemetry, receipt, adapter, hydrate, ux.
- **compatibility**: `legacy`, `render`. Do not use these for new work.

Experimental commands may change between alpha releases.
