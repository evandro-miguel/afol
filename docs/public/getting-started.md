# Getting started

## Install the source alpha

Linux x64 is the supported alpha target. Build with the Bun version pinned in
`package.json`:

```bash
git clone <public-repository-url> afol
cd afol
bun install --frozen-lockfile
bun run build
install -Dm755 ./dist/afol "$HOME/.local/bin/afol"
"$HOME/.local/bin/afol" --version
```

Ensure `$HOME/.local/bin` is on `PATH`.

A source tag does not imply that a standalone binary was promoted. Use a
downloadable binary only when its GitHub Release supplies the artifact,
checksum, provenance, security report, license bundle, and installation
instructions for that exact version.

## Create a project

Create a Git repository and initialize AFOL:

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

Use `afol help` and `afol help <command>` for flags. See the
[command reference](command-reference.md) and
[troubleshooting guide](troubleshooting.md).

Linux x64 is the supported alpha target. WSL2 has observed local smoke; native
Windows is experimental, and macOS/ARM are unsupported.
