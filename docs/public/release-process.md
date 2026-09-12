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

### Deterministic Linux x64 staging

After `validate:release` has produced `dist/afol`, its provenance, and its
release security report, place the reviewed compliance bundle under
`release/compliance/linux-x64/`. It must contain `compliance-review.json` plus
every approved notice, license, and relinkable-material file. The review record
uses schema `afol.release-compliance/v1` and binds the exact artifact SHA-256,
source commit, Bun version, reviewer, review time, and sorted `license_files`.
The staging command will not generate or approve that legal decision.

Then run:

```bash
bun run release:stage
cd dist/release/afol-linux-x64
sha256sum -c afol-linux-x64.sha256
```

The deterministic staged directory contains:

- `afol-linux-x64`
- `afol-linux-x64.sha256`
- `provenance.json`
- `security-scan.json`
- `sbom.spdx.json`
- `manifest.json`
- `licenses/`

The command rejects an unapproved or mismatched compliance review, incomplete
license inventory, non-passing dependency or secret scan, mismatched source or
artifact hash, non-Linux-x64 provenance, symlink escape, or missing evidence.
The checksum names the final downloadable asset, so verification works after
all assets are downloaded into one empty directory.

Staging is necessary but not sufficient for publication. Run the documented
download, install, example, rollback, and uninstall smoke against the actual
published URLs before attaching or promoting the binary.

## Local release evidence

This repository ships no hosted CI workflow. Local validation against the exact
candidate SHA is the canonical engineering evidence. An absent hosted run is
not a pass, failure, or product-status signal.

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

Release scans require `AFOL_OSV_SCANNER_PATH` and `AFOL_GITLEAKS_PATH` to name
absolute paths to operator-approved readable regular scanner files; AFOL rejects
path components reported as symbolic links, non-absolute/missing/non-regular
files, and identity changes during read/revalidation, then executes an
immutable verified byte copy. Release has no PATH fallback. Informative scans
use PATH and may skip absent scanners. Direct `"$AFOL_*_PATH" --version` only
checks availability/version and does not validate AFOL path/identity
constraints; `bun run security:scan:release` is the validating command and owns
`dist/security-scan.release.json`.

When run from a Git checkout, `public:audit` also checks reachable history
blobs. Run it after cloning the exact public `afol.public` candidate.

Linux x64 is the supported alpha target. WSL2 has observed local smoke. Native
Windows remains experimental, and macOS/ARM are unsupported.

### Recovery

If `bun run validate:release` fails, rerun the failing step from its output,
fix drift, lint, type, test, or coverage failures, run
`bun install --frozen-lockfile` when lockfile or toolchain drift is reported,
and re-run the full gate on the exact candidate SHA. For scanner failures,
confirm both variables name absolute paths to operator-approved readable regular
scanner files; direct `"$AFOL_OSV_SCANNER_PATH" --version` and
`"$AFOL_GITLEAKS_PATH" --version` only check availability/version and do not
validate AFOL path/identity constraints. Rerun `bun run security:scan:release`
(validating command, report owner) or `bun run validate:security:release`, and
inspect `dist/security-scan.release.json` for the recorded reason.
