# Contributing To AFOL

AFOL accepts focused changes that preserve the external `afol` command,
AFOL-only state ownership, and the Linux x64 release boundary.

## Development Flow

1. Create a short-lived branch from `dev`.
2. Install the pinned dependencies with `bun install --frozen-lockfile`.
3. Make the smallest change that addresses one problem.
4. Add focused tests for behavior changes.
5. Open a pull request into `dev`.

`main` is the official release feed and accepts changes only through the
governed promotion path from `dev`. Do not force-push shared branches.

## Required Checks

Run the narrowest relevant test while developing. Before requesting release
review, run:

```bash
bun run manifest:check
bun run typecheck
bun test --only-failures
bun run local-state:rebuild
bun run kernel -- health --release --json
bun run validate:release
```

Documentation changes should preserve working relative links and valid
Markdown structure.

## Security And Privacy

Never commit credentials, private keys, `.env` files, cookies, tokens, private
repository content, production configuration, or user data. Use the private
security-advisory channel for vulnerabilities instead of a public issue.

## Scope Boundaries

- Do not restore the discontinued `.agents` executable/runtime system.
- Do not add a project-local AFOL executable to downstream scaffolds.
- Do not claim support for platforms without observed native or VM-backed
  evidence.
- Do not publish, deploy, install globally, or change repository visibility as
  part of an ordinary contribution.
