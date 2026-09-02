# AFOL public source contract

This file is the repository guidance for the public AFOL source tree. This
repository is the canonical engine source for the CLI, template, tests,
documentation, and local release tooling.

## Repository boundaries

- `main` is merge-only. Create a short-lived topic branch from `main`, open a
  pull request back to `main`, and merge only after review.
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
bun test cli/tests/public-content-audit.test.ts
bun test
bun run public:audit -- .
bun run validate:release
```

Linux x64 is the supported source-execution target; WSL2 has observed local
smoke. Native Windows is experimental; macOS and ARM are unsupported. The
alpha is source-only: no standalone binary or registry package is promised.
Do not claim hosted green status, attestations, or global installation. Those
actions require explicit authorization and separate observed proof.

Keep secrets and credentials out of source and docs. Public examples must be
runnable from a clean checkout and must not depend on private governance.

Codex reads the root `AGENTS.md` directly, and that file remains canonical with
`.afol/` state. The sole optional adapter manages the exact Antigravity
workspace rule `.agents/rules/afol.md`; activate that rule in the IDE when
needed. See [Codex and Antigravity integration](docs/public/provider-integrations.md).
