# Architecture

AFOL has three boundaries:

```text
Universal CLI
  -> validates and mutates through typed services
Project template
  -> installs static governance and optional workspace metadata
Project-local state
  -> records tasks, events, evidence, locks, and journals
```

The CLI is the composition root. Command handlers parse intent and call domain
services; filesystem and subprocess adapters enforce project-root, timeout,
output, and atomic-write boundaries. The generated template is built from
`src/project-template/` with normalized text bytes and a deterministic hash.
Codex reads the root `AGENTS.md` directly. The sole optional integration is the
Antigravity workspace rule `.agents/rules/afol.md`.

Canonical state remains human-readable where practical. SQLite materializes
workbench and evidence state for fast queries; it does not replace the full
project governance tree as the source of truth.

Local release validation binds the exact Git commit, package metadata, lockfile,
template hash, platform, architecture, and scanner outcomes. The alpha release
contract is source-only; local build outputs are validation evidence, not
published downloads.

The first alpha advertises Linux x64 from local exact-SHA validation. WSL2 has
observed local smoke; native Windows is experimental, and macOS and ARM are
unsupported. Hosted CI supplies pull-request and `main` regression evidence;
local exact-SHA validation remains the source-release authority. Codex consumes
the canonical root `AGENTS.md`; the optional Antigravity rule is managed only
at `.agents/rules/afol.md`. See [Architecture decision records](adr/README.md)
for the public contract choices.
