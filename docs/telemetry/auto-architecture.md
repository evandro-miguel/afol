# Telemetry Architecture

AFOL is the only public downstream CLI path.

Telemetry should be emitted by AFOL-native lifecycle and validation commands:

```bash
afol n <theme> --feature-id <F-id> --parent-spec <spec-id>
afol st -S <session-id> -T <task-id>
afol d -S <session-id> -T <task-id> -x "<verification command>"
afol c -S <session-id>
afol validate --json
```

Pending public work:

- Query telemetry events through AFOL.
- Generate telemetry reports through AFOL.
- Export dashboard-ready metrics through AFOL.
- Validate telemetry schemas through AFOL.

Do not document retired compatibility command runners as public telemetry
architecture.
