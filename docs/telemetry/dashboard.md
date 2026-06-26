# Telemetry Dashboard

The telemetry dashboard is not a public AFOL feature yet.

Current public validation is:

```bash
afol validate project --json
afol local-state freshness
```

Runtime benchmark packs belong to `afol bench` / `afol validate bench`; the
project-benchmark catalog belongs to `afol pb`.

Dashboard generation, event queries, report export, and metric panels must land
as AFOL-native Bun/TypeScript commands before this page can include executable
usage. Until then, treat telemetry dashboard material as internal factory state
and do not publish retired compatibility command examples.
