# AFOL CLI

AFOL means **A Folder**. It is a local CLI that gives coding agents a consistent
project layout, a governed task lifecycle, and completion only after an observed
check.

No daemon. No cloud account. No model vendor lock-in.

AFOL is the only supported public CLI. The old `.agents` command/runtime
system is retired and must not be restored.

> Alpha. The supported release target is Linux x64. WSL2 works from observed
> local smoke. Native Windows is experimental. macOS and ARM are not supported
> yet.

## Why

Agent sessions lose context, invent project layouts, and call work done without
a reproducible check. AFOL makes the path explicit and inspectable on disk:

```text
Intent -> Spec -> Task -> Execution -> Evidence -> Close
```

## Run from source

The alpha is source-only. Clone this repository, enter its checkout, and use
the pinned Bun toolchain:

```bash
bun install --frozen-lockfile
./afol --version
```

The `afol` script is a source runner for this checkout; it is not installed
into a project or published as a registry package. To use it from a separate
project, keep the checkout path in a shell variable:

```bash
AFOL_ROOT="$PWD"
mkdir ../afol-demo && cd ../afol-demo
"$AFOL_ROOT/afol" init
```

`package.json` is private and exists for source builds and tests. This alpha
does not publish a standalone binary or a package-manager installation.

## Platform and validation boundary

The release claim is intentionally limited to source execution on Linux x64.
WSL2 has observed local smoke from `bun run smoke:wsl2`; that does not
establish Windows-native, macOS, or ARM support. This repository ships no
hosted CI workflow, so local exact-SHA validation is the release evidence.
Hosted service support is not claimed.

## Quickstart

```bash
AFOL="$AFOL_ROOT/afol"
"$AFOL" qt first-proof -t "Create the first verified change" -c "git diff --check"
"$AFOL" status
```

Multi-step work:

```bash
"$AFOL" new feature-name --task "Implement behavior" --task "Add tests"
"$AFOL" start T-01
"$AFOL" d T-01 -x "git diff --check"
"$AFOL" close
```

`afol` stays outside the project. After `init`, the project owns:

```text
.afol/          local config, governance, tasks, evidence
.agents/        optional workspace metadata and project skills
```

## What is stable in this alpha

- `init` / `bootstrap`, status, health, and project validation
- Governed tasks: `new`, `start`, evidence, `done`, `close`, `qt`
- Previewed template updates
- Safe local file mutations

Treat `evolve`, `fleet`, `memory`, `library`, benchmarks, telemetry, receipts,
and other experimental commands as experimental. The `adapter` lifecycle is a
stable alpha surface. Codex reads the root `AGENTS.md` directly; the sole
optional adapter manages the exact Antigravity workspace rule
`.agents/rules/afol.md`, which a user may need to activate in the IDE. See
[Codex and Antigravity integration](docs/public/provider-integrations.md) and
`afol help --json` for the live stability flag on every command.

## Docs

- [Getting started](docs/public/getting-started.md)
- [Command reference](docs/public/command-reference.md)
- [Architecture](docs/public/architecture.md)
- [Security model](docs/public/security-model.md)
- [Troubleshooting](docs/public/troubleshooting.md)
- [Upgrade and rollback](docs/public/upgrade-and-rollback.md)
- [Release process](docs/public/release-process.md)
- [Publishing checklist](docs/public/publishing.md)
- [Codex and Antigravity integration](docs/public/provider-integrations.md)
- [Known limitations](docs/public/known-limitations.md)
- [Roadmap](ROADMAP.md)
- [Case study](docs/public/case-study/README.md)
- [Public documentation index](docs/public/README.md)
- [Architecture decisions](docs/public/adr/README.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Use issues for bugs and features.
Report vulnerabilities through [SECURITY.md](SECURITY.md), never a public
issue.

MIT License. See [LICENSE](LICENSE).
