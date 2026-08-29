# Release process

AFOL separates public source publication from standalone-binary distribution.
They have different risk and evidence requirements.

## Source publication

The private factory repository must remain private. A normal branch does not
hide the factory history, other branches, or internal `.afol/` records.

Create the public source tree only through the allowlisted export:

```bash
TARGET="$(mktemp -d ../afol-public-candidate.XXXXXX)"
bun run public:export -- "$TARGET"
cd "$TARGET"
bun run public:audit
```

Initialize a new repository or another history-free destination after export.
Use a public Git author email before the first commit. Validate the exact public
commit from a fresh checkout before creating the public alpha tag.

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

Run this from a clean Linux x64 checkout:

```bash
bun install --frozen-lockfile
bun run validate:release
```

The local gate covers generated-file drift, lint, type checking, tests,
selected critical-surface coverage, deterministic build verification, secret
and dependency scans, artifact smoke, checksums, and provenance. It does not
replace the separate publication, repository-visibility, or license-compliance
checks above.

Linux x64 is the supported alpha target. WSL2 has observed local smoke. Native
Windows remains experimental, and macOS/ARM are unsupported.
