# Release process

AFOL separates public source publication from standalone-binary distribution.
They have different risk and evidence requirements.

## Repository boundary

The public `afol.public` repository is the canonical engine and release
checkout. The private factory checkout is only for governance, workbench
history, and the allowlisted public export. Do not build, tag, or publish a
release from the private factory.

## Source publication

The private factory repository must remain private. A normal branch does not
hide the factory history, other branches, or internal `.afol/` records. Run
only the allowlisted export there to create the public source tree:

```bash
TARGET="$(mktemp -d ../afol-public-candidate.XXXXXX)"
bun run public:export -- "$TARGET"
bun run public:audit -- "$TARGET"
```

Initialize the public `afol.public` repository or another history-free
destination after export. Use a public Git author email before the first
commit. Validate the exact public commit from a fresh `afol.public` checkout
before creating the public alpha tag.

See the [publishing checklist](publishing.md) for the complete cutover sequence.

## Standalone-binary distribution

AFOL is intended for binary use, but a successful build is not, by itself, a
distribution-ready release.

Before attaching a binary to a GitHub Release, the exact candidate must have:

- frozen-lockfile installation and all release validation passing
- a supported-platform smoke from a clean environment
- a checksum that references the final downloadable asset name
- provenance and security-scan reports bound to the artifact
- an SPDX SBOM for the final artifact
- complete applicable license notices for bundled packages and the Bun runtime
- any relinkable materials or equivalent compliance package required by
  bundled runtime licenses
- a download, checksum, install, rollback, and uninstall smoke

Until every item is satisfied, publish source only and do not attach the
standalone executable.

## Local release evidence

Per ADR-009, this repository ships no hosted CI workflow. Local validation
against the exact candidate SHA is the canonical engineering evidence. An
absent hosted run is not a pass, failure, or product-status signal.

Run this from a clean Linux x64 checkout of the public `afol.public` repository:

```bash
bun install --frozen-lockfile
bun run validate:release
```

The local gate covers generated-file drift, lint, type checking, tests,
selected critical-surface coverage, deterministic build verification, secret
and dependency scans, artifact smoke, checksums, and provenance. It does not
replace the separate publication, repository-visibility, or license-compliance
checks above.

When run from a Git checkout, `public:audit` also checks reachable history
blobs. Run it after cloning the exact public `afol.public` candidate.

Linux x64 is the supported alpha target. WSL2 has observed local smoke. Native
Windows remains experimental, and macOS/ARM are unsupported.
