# Data Structure

The current data surface is a mix of template metadata and project state.

## Active Data Files

- `.agents/data/benchmarks/**`: benchmark registry, scenarios, baselines, and live results.
- `.agents/config.json`, `.agents/agents.config`, `.agents/lock.json`, `.agents/manifest.json`: repo-local project and scaffold configuration.
- `.agents/data/telemetry/**`: telemetry schema and related data contracts.
- `src/project-template/.agents/**`: template-side copies of the scaffold data that downstream projects receive.

## What Matters

- The data layer is still rooted in `.agents/`, but the exportable template only keeps the allowed scaffold payload.
- Template generation strips forbidden Python/runtime artifacts before the payload is written.
- `docs/map/extra/**` holds evidence and logs, not product data.
