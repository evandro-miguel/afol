# Telemetry Quick Reference

Telemetry read commands are AFOL-native and read-only.

Use the supported telemetry commands for local diagnostics:

```bash
afol telemetry query --json
afol telemetry query --type task_complete --limit 20
afol telemetry report --json
afol telemetry export --format jsonl
```

Runtime benchmark packs stay separate from project-benchmark catalogs:
`afol bench` and `afol validate bench` use `.afol/data/benchmarks`, while
`afol pb` uses `.afol/adm/project-benchmarks/` and
`.afol/data/project-benchmarks/`.

Heat scoring and dashboard commands are still not public AFOL features. Do not
document retired compatibility command runners as downstream workflows.

For governed delivery evidence, use:

```bash
afol evidence --session <session-id> --task-id <task-id> --command "<verification command>" --result passed
afol done --session <session-id> --task-id <task-id>
afol close --session <session-id>
```
