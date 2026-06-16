# Heat Scoring

Heat scoring is pending AFOL-native parity.

Current supported checks:

```bash
afol validate --json
afol local-state freshness
afol verify-tasks --strict
```

For release health checks, use `afol ht` and `afol doctor`.

Before heat scoring is documented as a public workflow, implement Bun/TypeScript
AFOL commands for:

- Scoring tools, patterns, skills, and sessions.
- Listing hot and cold items.
- Exporting JSON summaries.
- Validating telemetry input schemas.

Do not publish retired compatibility command examples for heat scoring.
