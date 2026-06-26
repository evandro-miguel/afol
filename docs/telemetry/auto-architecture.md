# Telemetry Architecture

AFOL is the only public downstream CLI path.

Telemetry should be emitted by AFOL-native lifecycle and validation commands:

```bash
afol new <theme> --feature-id <F-id> --parent-spec <spec-id>
afol start --session <session-id> --task-id <task-id>
afol evidence --session <session-id> --task-id <task-id> --command "<verification command>" --result passed
afol done --session <session-id> --task-id <task-id>
afol close --session <session-id>
afol validate project --json
```

Pending public work:

- Query telemetry events through AFOL.
- Generate telemetry reports through AFOL.
- Export dashboard-ready metrics through AFOL.
- Validate telemetry schemas through AFOL.

Do not document retired compatibility command runners as public telemetry
architecture.
