# Telemetry Quick Reference

Telemetry read commands are AFOL-native and read-only.

Use the supported telemetry commands for local diagnostics:

```bash
afol telemetry query --json
afol telemetry query --type task_complete --limit 20
afol telemetry report --json
afol telemetry export --format jsonl
```

Heat scoring and dashboard commands are still not public AFOL features. Do not
document retired compatibility command runners as downstream workflows.

For governed delivery evidence, use:

```bash
afol d -S <session-id> -T <task-id> -x "<verification command>"
afol c -S <session-id>
```
