# Getting started

AFOL is a standalone local CLI. Install a verified release asset, create or
enter a Git repository, and run `afol init`.

```bash
mkdir afol-demo
cd afol-demo
git init
afol init
afol status
```

Create a governed one-task workflow with an observed check:

```bash
afol qt first-proof -t "Create the first verified change" -c "git diff --check"
```

For work that needs multiple tasks, use `afol new`, `afol start`, `afol done
--execute`, and `afol close`. AFOL writes mutable state under `.afol/` and
provider-facing metadata under `.agents/`.

See [Troubleshooting](troubleshooting.md) if the project cannot be resolved or
a task cannot close.
