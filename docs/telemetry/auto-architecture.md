# Telemetry Architecture

AFOL is the only public downstream CLI path.

Telemetry should be emitted by AFOL-native lifecycle and validation commands.
Happy path (omit `-S` when the session resolves); `e` is diagnostic only:

```bash
afol n <theme> -F <F-id> -P <spec-id> -t "<task>"
afol st T-01
afol d T-01 -x "<verification command>"
afol c
afol v project --json
```

Long `--session` / `-S` forms remain valid for CI and multi-agent work when
the session is ambiguous.

Pending public work:

- Query telemetry events through AFOL.
- Generate telemetry reports through AFOL.
- Export dashboard-ready metrics through AFOL.
- Validate telemetry schemas through AFOL.

Do not document retired compatibility command runners as public telemetry
architecture.
