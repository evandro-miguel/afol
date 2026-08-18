# AFOL CLI

AFOL is a local, evidence-first operating layer for coding agents. It gives a
project a consistent task lifecycle, compact context, safe filesystem
mutations, and verifiable completion without requiring a daemon or cloud
service.

> Alpha software. Linux x64 is the supported release target. WSL2 is supported
> through observed smoke tests. Native Windows is experimental until hosted
> Windows CI evidence is green.

## Why AFOL

Coding-agent work often loses context, drifts across incompatible project
layouts, or declares completion without a reproducible check. AFOL makes the
workflow explicit:

```text
Intent -> Spec -> Task -> Execution -> Evidence -> Close
```

The project remains readable on disk. AFOL records state and evidence locally,
enforces path and mutation boundaries, and keeps the CLI independent from any
specific model provider or harness.

## Install

Download the Linux x64 asset from the latest GitHub release, verify its
checksum, and install the executable:

```bash
sha256sum --check afol-linux-x64.sha256
install -m 755 afol-linux-x64 "$HOME/.local/bin/afol"
afol --version
```

Building from source requires Bun 1.3.14 or newer:

```bash
bun install --frozen-lockfile
bun run build
./dist/afol --version
```

AFOL is binary-first. The package is intentionally private and is not an npm
distribution channel.

## Quickstart

```bash
mkdir demo-project && cd demo-project
git init
afol init
afol qt fix-validation -t "Add input validation" -c "bun test"
afol status
```

For a multi-step task:

```bash
afol new feature-name --task "Implement behavior" --task "Add tests"
afol start T-01
afol done T-01 --execute "bun test"
afol close
```

AFOL creates a project-local scaffold similar to:

```text
.afol/
├── config.json
├── adm/
├── state/
└── wb/

.agents/
├── manifest.json
├── lock.json
└── skills/
```

The `afol` executable remains external to downstream projects.

## Capabilities

- Project bootstrap and owned-template updates with previews.
- Governed tasks with observed evidence before completion.
- Atomic, journaled, and recoverable local mutations.
- Compact context, health, status, and validation surfaces.
- Path traversal, symlink escape, subprocess timeout, and output limits.
- Deterministic build receipts, checksums, security scans, and provenance.

## Stability

Every command reports one of three stability levels in `afol help --json` and
the generated tool catalog:

- `stable`: core bootstrap, lifecycle, evidence, validation, update, and safe
  mutation workflows for the alpha.
- `experimental`: evolution, fleet, memory/library adoption, benchmarks,
  telemetry, receipts, and provider-adjacent surfaces.
- `compatibility`: retained aliases or transition surfaces that should not be
  used for new integrations.

See [Roadmap](ROADMAP.md) for the support matrix and planned work.

## Security model

AFOL is a local operator tool, not a multi-user authorization service. Its
agent and remote modes reduce capabilities but do not authenticate principals.
AFOL does not protect a project from another malicious process with the same
filesystem permissions.

Sensitive operations fail closed, paths must remain inside the project root,
and subprocesses have bounded execution. See
[Security model](docs/security-model.md) and [SECURITY.md](SECURITY.md).

## Architecture and evidence

```text
Universal CLI -> Exported template -> Project-local state
```

The public repository is the canonical source for code, tests, documentation,
and release artifacts. Private operational sessions are not required to build
or use AFOL.

- [Getting started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Command reference](docs/command-reference.md)
- [Release verification](docs/release-process.md)
- [Case study](docs/case-study/README.md)
- [Known limitations](docs/known-limitations.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Use public issues for bugs and feature
requests, and follow [SECURITY.md](SECURITY.md) for vulnerabilities.

AFOL is licensed under the [MIT License](LICENSE).
