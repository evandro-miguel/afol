# Getting started

## Run the source alpha

The alpha is source-only. Bun `>=1.3.14` and Git are required. Linux x64 is
the supported source-execution target; WSL2 has observed local smoke. Native
Windows is experimental, and macOS and ARM are unsupported.

From the repository checkout:

```bash
bun install --frozen-lockfile
./afol --version
AFOL_ROOT="$PWD"
```

`afol` is the checkout's source runner. It is not copied into a target project,
installed globally, or published as a package. Keep `AFOL_ROOT` when working
from a separate project:

```bash
mkdir ../afol-demo
cd ../afol-demo
git init
"$AFOL_ROOT/afol" init
"$AFOL_ROOT/afol" status
```

## Create a project

Record one evidenced task:

```bash
"$AFOL_ROOT/afol" qt first-proof \
  -t "Create the first verified change" \
  -c "git diff --check"
```

Several tasks:

```bash
"$AFOL_ROOT/afol" new feature-name --task "Implement behavior" --task "Add tests"
"$AFOL_ROOT/afol" start T-01
# edit the project
"$AFOL_ROOT/afol" d T-01 -x "git diff --check"
"$AFOL_ROOT/afol" close
```

AFOL writes mutable state under `.afol/`. The optional Antigravity workspace
rule is the exact file `.agents/rules/afol.md`; the source runner stays outside
the project. Use `afol help` and
`afol help <command>` for flags. See the [command reference](command-reference.md)
and [troubleshooting guide](troubleshooting.md).

## Use Codex or Antigravity

Codex reads the root `AGENTS.md` directly. If you use Antigravity, enable the
optional adapter and activate the workspace rule in the IDE when needed. See
[Codex and Antigravity integration](provider-integrations.md) for the exact
file and conflict rules.

The repository ships no hosted CI workflow. Local exact-SHA checks are the
validation evidence for this source-only alpha.
