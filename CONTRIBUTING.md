# Contributing to AFOL

AFOL is alpha software. Keep changes focused, preserve existing behavior unless
the proposal explicitly changes it, and add evidence for every completion
claim.

## Development flow

1. Create a short-lived branch from `dev`.
2. Install the pinned dependencies with `bun install --frozen-lockfile`.
3. Make the smallest change that addresses one problem.
4. Add focused tests for behavior changes.
5. Open a pull request into `dev`.

## Required checks

Run the narrowest relevant test while developing. Before requesting review for
release-affecting changes, run:

```bash
bun run version:check
bun run manifest:check
bun run template:check
bun run typecheck
bun test --only-failures
bun run local-state:rebuild
bun run kernel -- health --release --json
bun run validate:release
```

Security checks include Gitleaks and OSV Scanner. Release scans require
`AFOL_OSV_SCANNER_PATH` and `AFOL_GITLEAKS_PATH` to name absolute paths to
operator-approved readable regular scanner files; AFOL rejects path components
reported as symbolic links, non-absolute/missing/non-regular files, and
identity changes during read/revalidation, then executes an immutable verified
byte copy. Release has no PATH fallback; informative scans use PATH and may
skip absent scanners. Direct `"$AFOL_*_PATH" --version` only checks
availability/version and does not validate AFOL path/identity constraints;
`bun run security:scan:release` is the validating command and owns
`dist/security-scan.release.json`. Do not commit generated
drift. Documentation changes should preserve working relative links and valid
Markdown structure. All release evidence is produced locally against the exact
public `afol.public` candidate SHA; a private factory checkout is only the
governance and export-factory surface. This repository has no hosted CI
workflow.

## Security and privacy

Never commit credentials, private keys, `.env` files, cookies, tokens, private
repository content, production configuration, or user data. Use the private
security-advisory channel for vulnerabilities instead of a public issue.

## Scope boundaries

- Do not restore the discontinued `.agents` executable/runtime system.
- Do not add a project-local AFOL executable to downstream scaffolds.
- Do not claim support for platforms without observed native or VM-backed
  evidence.
- Do not deploy, install globally, or change repository visibility as part of an
  ordinary contribution.

Relevant design changes should include or update a public ADR. See
[docs/public/adr/README.md](docs/public/adr/README.md) for the public records.
