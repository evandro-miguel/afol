# Contributing to AFOL

AFOL is alpha software. Keep changes focused, preserve existing behavior unless
the proposal explicitly changes it, and add evidence for every completion
claim.

## Development flow

1. Create a short-lived topic branch from `main`.
2. Install the pinned dependencies with `bun install --frozen-lockfile`.
3. Make the smallest change that addresses one problem.
4. Add focused tests for behavior changes.
5. Open a pull request into `main`.
6. Merge only through the reviewed pull request; do not push directly to
   `main`.

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

Security checks include Gitleaks and OSV Scanner. Do not commit generated drift.
Documentation changes should preserve working relative links and valid Markdown
structure. Release evidence is produced locally against the exact candidate
SHA. The alpha is source-only: a source tag does not imply a standalone binary
or registry package. Hosted CI supplies regression evidence but not release
authorization; see the [continuous integration contract](docs/public/ci.md)
and ADR-007.

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
Codex reads the root `AGENTS.md` directly. The sole optional adapter manages
only the exact Antigravity workspace rule `.agents/rules/afol.md`; a user may
need to activate that rule in the IDE. See [Codex and Antigravity
integration](docs/public/provider-integrations.md) before changing this
surface.
