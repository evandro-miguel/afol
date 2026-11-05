# Source release checklist

This repository publishes the AFOL alpha as source. There is no separate
factory/export step, and the alpha does not attach standalone executables or
publish a registry package.

## 1. Prepare a reviewed candidate

- Create a short-lived topic branch from `main_dev`.
- Keep the change focused and preserve unrelated dirty state.
- Add or update the public documentation and ADR when the contract changes.
- Run the narrowest relevant checks while developing.
- Open a pull request into `main_dev` with the exact candidate SHA and evidence.

`main_dev` is the sole development and integration branch. Do not push directly
to `main_dev` or `main`. Promotion to protected `main` requires the exact
`main_dev` tree to pass local and hosted checks, review, and separate explicit
approval. This checklist does not authorize promotion.

## 2. Validate the exact source commit

From a clean checkout of the candidate commit, run:

```bash
bun install --frozen-lockfile
bun run public:audit -- .
bun run validate:toolchain
bun run typecheck
bun run validate:template
bun run validate:bootstrap
bun run test:full
bun run coverage:check
bun run smoke:example
```

Run the complete local gate when release readiness is in scope:

```bash
bun run validate:release
```

Record the exact commit SHA and observed exit status for each command. The
public-content audit checks current files, local links, examples, and reachable
Git history. A result from another commit cannot authorize this release.

## 3. Confirm the source boundary

Before tagging, confirm that:

- the checkout is clean and the candidate commit is the approved `main` tip,
  descended from the validated `main_dev` tree;
- README commands work from a clean checkout with the pinned Bun version;
- no credentials, private paths, raw sessions, build outputs, or local state
  are tracked;
- source-only alpha wording is consistent across README, release docs, and
  known limitations;
- root `AGENTS.md` remains canonical for Codex, and the exact Antigravity rule
  `.agents/rules/afol.md` is the only optional integration.
- hosted `quality`, `tests`, `core-smoke`, and `deep-validation` checks pass on
  the reviewed `main_dev` candidate and approved `main` tip.

Hosted CI is regression evidence. Local exact-SHA checks remain the release
evidence and a green hosted run does not authorize publication.

## 4. Publish the source release

After review and local validation, and only with the required repository
authority:

```bash
git config --local user.email "me@evandro-miguel.com"
git show -s --format='%H %ae %ce' HEAD
git tag --annotate <version> --message "AFOL <version>"
git show --stat --oneline <version>
```

The root commit's publishing email must be `me@evandro-miguel.com`; verify the
`git show` output before creating the tag.

Publish only the authorized source tag or source archive. Do not attach a
standalone executable, create a package-manager release, or claim hosted
attestations for this alpha.

## Go or no-go

Publish the source alpha only when all statements below are true:

- the exact candidate SHA passed the local gate;
- the public-content audit passed for current files and reachable history;
- known bugs and unsupported platforms are accurately disclosed;
- README and documentation examples work from a clean checkout;
- the optional Antigravity workspace rule is not enabled implicitly by the
  source release.
