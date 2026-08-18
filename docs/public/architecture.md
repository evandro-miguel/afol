# Architecture

AFOL has three boundaries:

```text
Universal CLI
  -> validates and mutates through typed services
Exported template
  -> installs static governance and provider metadata
Project-local state
  -> records tasks, events, evidence, locks, and journals
```

The CLI is the composition root. Command handlers parse intent and call domain
services; filesystem and subprocess adapters enforce project-root, timeout,
output, and atomic-write boundaries. The generated template is built from
`src/project-template/` with normalized text bytes and a deterministic hash.

Canonical state remains human-readable where practical. SQLite materializes
workbench and evidence state for fast queries; it does not replace the full
project governance tree as the source of truth.

Release artifacts are compiled from this public source. Their receipt binds
the build flags and artifact hash, while provenance binds the exact Git commit,
package metadata, lockfile, template hash, platform, architecture, and scanner
outcomes.
