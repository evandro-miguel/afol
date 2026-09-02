# Update, rollback, and remove the source checkout

The AFOL alpha is source-only. Keep the repository checkout separate from
projects initialized by AFOL; project state under `.afol/` is owned by the
project and is not replaced by updating the source checkout.

## Verify the current checkout

Run these commands from the AFOL repository root:

```bash
git status --short
git rev-parse HEAD
bun install --frozen-lockfile
./afol --version
```

Do not update a checkout with unrelated uncommitted changes. Record or commit
your work first, or use a separate clean worktree.

## Update the source checkout

Fetch the reviewed source history, fast-forward `main`, reinstall the pinned
dependencies, and run a smoke check:

```bash
git fetch --tags origin
git switch main
git pull --ff-only
bun install --frozen-lockfile
bun run public:audit -- .
./afol --version
```

The source update does not install a global command or modify any initialized
project. Keep the checkout path available to projects through the source-runner
pattern in [Getting started](getting-started.md).

## Update a project template

Before applying a template update, commit or back up project-owned changes and
run:

```bash
afol update check
afol update preview
afol update apply --dry-run
```

Apply only after reviewing ownership classifications. AFOL journals managed
mutations and reports conflicts instead of silently replacing project-owned
files. Never delete `.afol/` wholesale: it contains task, evidence, and
recovery state.

## Roll back the source checkout

Find the last known-good commit, then use a detached checkout only when the
working tree is clean:

```bash
git log -n 10 --oneline
git status --short
git switch --detach <known-good-commit>
bun install --frozen-lockfile
bun run public:audit -- .
./afol --version
```

This rolls back the source runner without changing project state. To return to
the reviewed branch after diagnosis, use a clean checkout and update it
through the normal pull-request and `main` flow.

## Remove the source checkout

The source runner has no global installation to uninstall. After confirming
the exact checkout path is not an initialized project, move it aside or remove
it using the operating system's normal file-management tools. Initialized
projects retain their `.afol/` state and are unaffected.

The procedure is local and user-scoped. This repository has no hosted update
channel, and this source-only alpha does not publish standalone downloads or
registry packages.
