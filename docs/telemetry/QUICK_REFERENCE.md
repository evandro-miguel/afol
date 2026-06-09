# Telemetry Quick Reference

Telemetry public commands are pending AFOL-native parity.

Use the supported public gates for current checks:

```bash
afol validate --json
afol local-state freshness
afol verify-tasks --strict
```

Telemetry data remains an internal factory artifact until query, report, export,
heat scoring, and dashboard commands are implemented in the Bun/TypeScript AFOL
CLI. Do not document retired compatibility command runners as downstream
workflows.

For governed delivery evidence, use:

```bash
afol d -S <session-id> -T <task-id> -x "<verification command>"
afol c -S <session-id>
```
