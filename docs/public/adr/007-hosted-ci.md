# ADR 007: Hosted CI provides regression evidence

- Status: Accepted
- Date: 2026-09-03

## Context

AFOL already has a rigorous local release gate. `bun run validate:release`
binds evidence to an exact source candidate and includes approved local
security scanners, deterministic build verification, provenance, and runtime
smokes. Contributors still need fast, visible feedback before integration,
and the protected default branch needs stable status checks.

Treating a hosted run as release authorization would weaken the distinction
between ordinary regression evidence and the evidence required to publish a
source release.

## Decision

The repository has one governed workflow at `.github/workflows/ci.yml`.
Pull requests run three stable checks: `quality`, `tests`, and `core-smoke`.
Pushes to `main` also run `deep-validation` after those checks pass.

The workflow uses the supported Linux x64 runner, the repository's pinned Bun
version, read-only token permissions, full-history checkout, and immutable
full-SHA Action references. It does not receive secrets, persist checkout
credentials, upload artifacts, use dependency caches, or use
`pull_request_target`.

`bun run validate:release` remains the sole engineering release gate. Hosted
CI does not publish, attest, tag, install, or authorize a release.

## Consequences

- Pull requests and `main` receive public regression evidence.
- The stable required checks are `quality`, `tests`, and `core-smoke`.
- `deep-validation` increases confidence in `main` without delaying every
  pull request.
- GitHub repository settings add protection but are not release evidence.
- Dependabot keeps full-SHA GitHub Action references reviewable and current.
- Release candidates still require a clean local checkout and a successful
  `bun run validate:release` on the exact candidate SHA.
