# Getting started

Use a verified Linux x64 release asset supplied for the candidate, or build
`./dist/afol` from this repository. Then create a Git repository and run
`afol init`.

```bash
mkdir afol-demo
cd afol-demo
git init
afol init
afol status
```

One evidenced task:

```bash
afol qt first-proof -t "Create the first verified change" -c "git diff --check"
```

Several tasks:

```bash
afol new feature-name --task "Implement behavior" --task "Add tests"
afol start T-01
# edit the project
afol d T-01 -x "git diff --check"
afol close
```

AFOL writes mutable state under `.afol/` and provider metadata under
`.agents/`. The `afol` executable must stay outside the project.

Use `afol help` and `afol help <command>` for flags. See
[Command reference](command-reference.md) and
[Troubleshooting](troubleshooting.md).

Linux x64 is the supported alpha target. WSL2 has observed local smoke; native
Windows is experimental, and macOS/ARM are unsupported.
