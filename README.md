# AFOL CLI

AFOL means **A Folder**. It is a local CLI that gives coding agents a consistent
project layout, a governed task lifecycle, and completion only after an observed
check.

No daemon. No cloud account. No model vendor lock-in.

> Alpha. The supported release target is Linux x64. WSL2 works from observed
> local smoke. Native Windows is experimental. macOS and ARM are not supported
> yet.

## Why

Agent sessions lose context, invent project layouts, and call work done without
a reproducible check. AFOL makes the path explicit and inspectable on disk:

```text
Intent -> Spec -> Task -> Execution -> Evidence -> Close
```

## Install

Download the Linux x64 asset from the latest GitHub Release, then:

```bash
sha256sum --check afol-linux-x64.sha256
install -m 755 afol-linux-x64 "$HOME/.local/bin/afol"
afol --version
```

Build from source with Bun 1.3.14 or newer:

```bash
bun install --frozen-lockfile
bun run build
./dist/afol --version
```

AFOL is binary-first. The npm `package.json` is for source builds and is marked
private; it is not a registry package.

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
afol done T-01 --execute "git diff --check"
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

- [Getting started](docs/getting-started.md)
- [Command reference](docs/command-reference.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Upgrade and rollback](docs/upgrade-and-rollback.md)
- [Known limitations](docs/known-limitations.md)
- [Roadmap](ROADMAP.md)
- [Case study](docs/case-study/README.md)
- [Documentation index](docs/README.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Use issues for bugs and features.
Report vulnerabilities through [SECURITY.md](SECURITY.md), never a public
issue.

MIT License. See [LICENSE](LICENSE).
