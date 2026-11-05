# AFOL public source contract

This file is the repository guidance for the public AFOL source tree. This
repository is the canonical engine source for the CLI, template, tests,
documentation, and local release tooling.

## Repository boundaries

- `main_dev` is the sole development and integration branch. Create short-lived
  topic branches from `main_dev` and merge them through reviewed pull requests
  into `main_dev`.
- Keep `main` protected. Promotion of a tested and reviewed `main_dev` commit to
  `main` requires separate explicit approval; this repository guidance does not
  grant that approval.
- Do not push directly to `main_dev` or `main`.
- Implementation lives under `cli/**` and `src/**`; tests live under
  `cli/tests/**`; public docs live under `docs/public/**`.
- Do not version a root `.afol/**`, `.agents/**`, private governance, raw
  sessions, private paths, or internal operator state. Internal governance is
  external to the public repository.
- `afol` is an external operator command. Downstream projects must not receive
  a project-local AFOL executable, wrapper, symlink, or package bin.

## Local validation

ADR-007 separates hosted regression evidence from exact-SHA local release
validation. Pull requests receive `quality`, `tests`, and `core-smoke`. Pull
requests targeting `main_dev` or `main`, and pushes to either branch, also
receive `deep-validation`. Complete the local release gate and review before
passing all required hosted checks and seeking explicit approval to promote a
`main_dev` commit to `main`:

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
Do not treat hosted green status as release authorization or claim
attestations or global installation. Those actions require explicit
authorization and separate observed proof.

Keep secrets and credentials out of source and docs. Public examples must be
runnable from a clean checkout and must not depend on private governance.

Codex reads the root `AGENTS.md` directly, and that file remains canonical with
`.afol/` state. The sole optional adapter manages the exact Antigravity
workspace rule `.agents/rules/afol.md`; activate that rule in the IDE when
needed. See [Codex and Antigravity integration](docs/public/provider-integrations.md).
