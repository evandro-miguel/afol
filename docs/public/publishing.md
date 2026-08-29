# Publishing checklist

This checklist publishes the public source alpha without exposing the private
factory history.

## 1. Freeze the candidate

- Choose one source SHA from the private release branch.
- Resolve or explicitly document every open release blocker.
- Confirm the version, changelog, supported platform, and stability labels.
- Do not change the private factory repository to public visibility.

## 2. Validate the private source SHA

From a clean Linux x64 checkout:

```bash
bun install --frozen-lockfile
bun run validate:release
bun run validate:project
git status --short
```

The final command must print nothing. Record the exact SHA and command results.

## 3. Export the public tree

From the validated private checkout:

```bash
TARGET="../afol-public-candidate"
rm -rf "$TARGET"
bun run public:export -- "$TARGET"
cd "$TARGET"
bun run public:audit
```

Review the root manually. The public tree must not contain private workbench
state, local paths, credentials, build outputs, coverage, editor state, or
factory-only governance.

## 4. Create fresh public history

Create the public commit only after the export. Configure a public or GitHub
noreply author email first.

```bash
git init -b main
git config user.name "<public-name>"
git config user.email "<public-or-noreply-email>"
git add -A
git commit -m "chore(release): publish AFOL 0.1.0-alpha.1"
test "$(git rev-list --count HEAD)" -eq 1
git status --short
```

The commit-count check must pass, and the final status command must print
nothing. Never merge or push the private repository history into this public
repository.

## 5. Revalidate the public commit

Clone the new public repository into another empty directory and run:

```bash
bun install --frozen-lockfile
bun run public:audit
bun run validate:toolchain
bun run typecheck
bun run validate:template
bun run validate:bootstrap
bun run test:full
bun run coverage:check
bun run smoke:example
```

Record the public commit SHA and results. Do not reuse evidence from an earlier
private or exported commit.

## 6. Configure the public repository

- Require pull requests for the default branch.
- Block force pushes and branch deletion.
- Enable Dependabot alerts and dependency updates.
- Enable private vulnerability reporting.
- Keep issue and pull-request templates.
- Add repository topics, a concise description, and the supported-platform
  warning.
- Create a prerelease tag only after the fresh-checkout validation passes.

## 7. Keep the first release source-only

Do not attach the standalone binary until the binary checklist in
[Release process](release-process.md) is complete. A source-only public alpha is
a valid release and keeps the legal and packaging boundary explicit.

## Go or no-go

Publish the source alpha only when all statements below are true:

- the public tree came from the allowlisted exporter
- public audit and fresh-checkout validation passed on the exact public SHA
- public history contains no private ancestor
- known bugs are fixed or accurately disclosed
- README commands work from a clean checkout
- no standalone binary is attached without its complete compliance package
