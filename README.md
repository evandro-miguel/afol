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

## Install from source

The public `afol.public` repository is the canonical engine and release source.
A private factory checkout may retain governance and export sanitized source,
but builds and release validation must run from a clean `afol.public` checkout.

Build with the pinned Bun toolchain:

```bash
bun install --frozen-lockfile
bun run build
install -Dm755 ./dist/afol "$HOME/.local/bin/afol"
"$HOME/.local/bin/afol" --version
```

Ensure `$HOME/.local/bin` is on `PATH` before using `afol` from another shell.

AFOL is intended to run as a standalone binary. The npm `package.json` exists
for source builds and is marked private; AFOL is not a registry package.
Source publication and standalone-binary distribution are separate release
actions. Do not assume a source tag includes a promoted binary.

## Platform and validation boundary

The release claim is intentionally limited to the observed Linux x64 path.
Platform evidence for this alpha comes from local validation and
`bun run smoke:wsl2` in a Linux x64 WSL2 shell. It does not establish
Windows-native, macOS, or ARM support. Per ADR-009, this repository ships no
hosted CI workflow; local exact-SHA validation is the release evidence. Hosted
service support is not claimed.

Standalone builds disable Bun's `.env` and `bunfig.toml` autoloading so
repository-local configuration cannot change binary behavior.

## Quickstart

```bash
mkdir afol-demo && cd afol-demo
git init
afol init
afol qt first-proof -t "Create the first verified change" -c "git diff --check"
afol status
```

Multi-step work:

```bash
afol new feature-name --task "Implement behavior" --task "Add tests"
afol start T-01
afol d T-01 -x "git diff --check"
afol close
```

`afol` stays outside the project. After `init`, the project owns:

```text
.afol/          local config, governance, tasks, evidence
.agents/        provider metadata and optional project skills
```

## What is stable in this alpha

- `init` / `bootstrap`, status, health, and project validation
- Governed tasks: `new`, `start`, evidence, `done`, `close`, `qt`
- Previewed template updates
- Safe local file mutations

Treat `evolve`, `fleet`, `memory`, `library`, benchmarks, telemetry, receipts,
and provider adapters as experimental. See `afol help --json` for the live
stability flag on every command.

## Docs

- [Getting started](docs/public/getting-started.md)
- [Command reference](docs/public/command-reference.md)
- [Architecture](docs/public/architecture.md)
- [Security model](docs/public/security-model.md)
- [Troubleshooting](docs/public/troubleshooting.md)
- [Upgrade and rollback](docs/public/upgrade-and-rollback.md)
- [Release process](docs/public/release-process.md)
- [Publishing checklist](docs/public/publishing.md)
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
