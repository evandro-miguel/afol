# Contributing

AFOL is alpha software. Keep changes focused, preserve existing behavior unless
the proposal explicitly changes it, and add evidence for every completion
claim.

## Development

Requirements: Git and Bun 1.3.14 or newer.

```bash
bun install --frozen-lockfile
bun run typecheck
bun test --only-failures
bun run validate:template
```

Run `bun run validate:release` for release-affecting changes. Security checks
require Gitleaks and OSV Scanner; the release workflow pins their versions and
identities.

## Pull requests

- Describe the problem, scope, tests, security impact, documentation impact,
  and rollback.
- Do not commit generated drift. Run `bun run version:check`,
  `bun run manifest:check`, and `bun run template:check`.
- Do not add absolute home paths, credentials, raw agent sessions, or
  machine-specific state.
- Keep runtime dependencies in `dependencies`, not `devDependencies`.
- Mark new commands `stable`, `experimental`, or `compatibility`.

Relevant design changes should include or update an ADR under `docs/adr/`.
See [docs/adr/README.md](docs/adr/README.md) for the public records.
