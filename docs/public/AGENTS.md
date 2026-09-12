# AFOL public source contract

This file is mapped to the root `AGENTS.md` in the public export. The public
AFOL repository is the canonical engine source for the CLI, template, tests,
documentation, and local release tooling.

## Repository boundaries

- `main` is merge-only. Integrate reviewed topic work through the normal merge
  or pull-request path.
- `dev` is the integration branch. Use isolated topic worktrees for changes
  and preserve unrelated dirty state.
- Implementation lives under `cli/**` and `src/**`; tests live under
  `cli/tests/**`; public docs live under `docs/public/**`.
- Do not version a root `.afol/**`, `.agents/**`, private governance, raw
  sessions, private paths, or internal operator state. Internal governance is
  external to the public repository.
- `afol` is an external operator command. Downstream projects must not receive
  a project-local AFOL executable, wrapper, symlink, or package bin.

## Local validation

Local exact-SHA validation is canonical. This repository has no hosted
workflow. Run the narrowest relevant checks, then the full gate when release
readiness is in scope:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint:biome
bun run lint:oxlint
bun run lint:knip
bun test cli/tests/public-export.test.ts
bun test
bun run validate:release
```

Linux x64 is the supported alpha target; WSL2 has observed local smoke. Native
Windows is experimental; macOS and ARM are unsupported. Do not claim hosted
green status, publication, attestations, or global installation. Those actions
require explicit authorization and separate observed proof.

Keep secrets and credentials out of source and docs. Public examples must be
runnable from a clean checkout and must not depend on private governance.
