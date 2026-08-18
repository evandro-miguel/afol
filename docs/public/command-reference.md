# Command reference

Run `afol help`, `afol help --verbose`, or `afol help --json` for the registry-
generated command catalog. Run `afol help <command>` for one command.

Core lifecycle:

```text
afol init
afol status
afol new <theme> --task <text>
afol start <task-id>
afol evidence <task-id> --command <check> --outcome passed
afol done <task-id> --execute <check>
afol close
```

Project and template operations:

```text
afol bootstrap <target>
afol validate project --json
afol update check
afol update preview
afol update apply --dry-run
```

Command metadata includes category, side effect, approval requirement, aliases,
subcommands, and stability. Treat experimental commands as changeable between
alpha releases and compatibility commands as migration-only surfaces.
