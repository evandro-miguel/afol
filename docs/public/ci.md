# Continuous integration

Hosted CI provides public regression evidence. It does not authorize releases.
The local exact-SHA `bun run validate:release` gate remains canonical for
source release candidates.

## Workflow

The only approved workflow is `.github/workflows/ci.yml`.

| Check | Trigger | Purpose | Required check |
| --- | --- | --- | --- |
| `quality` | Every pull request and push to `main` | Generated drift, lint, public audit, types, template | Yes |
| `tests` | Every pull request and push to `main` | Serial-by-file fail-fast test suite | Yes |
| `core-smoke` | Every pull request and push to `main` | Bootstrap, provenance-bound build, public example | Yes |
| `deep-validation` | Push to `main` | Full suite, coverage, deterministic build, provenance, distribution and clean-project smokes | No |

All jobs use `ubuntu-24.04` and Bun 1.3.14. External Actions are pinned by
full commit SHA. The workflow has read-only repository contents permission,
does not persist checkout credentials, does not receive secrets, and does not
use `pull_request_target`, dependency caches, or uploaded artifacts.

## Repository settings

After the first successful run registers the check names, require these status
checks on `main`:

- `quality`
- `tests`
- `core-smoke`

Keep force pushes and branch deletion disabled. Enable CodeQL default setup for
JavaScript/TypeScript, secret scanning and push protection, Dependabot alerts,
and private vulnerability reporting when supported by the repository settings.
The versioned Dependabot configuration updates npm dependencies and full-SHA
GitHub Action references.

Repository settings must be verified through GitHub; their presence cannot be
proved by source files. They add hosted protection but do not replace local
Gitleaks and OSV Scanner release gates or checksum-bound provenance.

## Local reproduction

Run the command associated with the failed job first:

```bash
bun install --frozen-lockfile
bun run validate:toolchain
bun run public:audit -- .
bun run typecheck
bun run validate:template
bun run test:ci
bun run validate:bootstrap
bun run build
bun run release:provenance
bun run smoke:example
```

For `deep-validation`, reproduce its ordered commands from `ci.yml`. A release
candidate must additionally pass `bun run validate:release` from a clean Linux
x64 checkout at the exact candidate SHA.
