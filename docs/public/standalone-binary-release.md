# Standalone binary candidate smoke

This page documents the developer smoke for a staged Linux x64 release
candidate. It validates a local candidate in an owned temporary directory. It
does not change the source-only alpha distribution policy or publish an asset.

## Staged release contents

A verified stage contains the executable and its release evidence:

- `afol-linux-x64` and `afol-linux-x64.sha256`;
- `provenance.json`, binding the artifact hash, version, and source commit;
- `security-scan.json`, binding the artifact and source commit to the release
  scans;
- `sbom.spdx.json`, describing the executable and its generated package set;
- `licenses/compliance-review.json` and the reviewed license and notice files;
- `manifest.json`, listing every other staged file with its SHA-256 and size.

The stage verifier checks the complete file inventory and every listed hash
before the smoke executes the binary.

## Compliance review

Staging requires an approved `afol.release-compliance/v2` review. A human
reviewer must bind it to the exact artifact hash, source commit, and Bun
version. `license_files` names each reviewed license path and SHA-256.
`package_notice_files` maps every SPDX package identifier in the generated
SBOM to its reviewed notice paths. Coverage must include every generated SPDX
package and only reviewed license paths.

The compliance bundle must contain real review materials for AFOL, its
dependencies, and the Bun runtime embedded in the executable. Bun documents
that its compiled executable includes a copy of the runtime in the
[single-file executable guide](https://bun.sh/docs/bundler/executables). A
human reviewer must assess the embedded library and any relinking requirements
against the [Bun 1.3.14 license](https://github.com/oven-sh/bun/blob/bun-v1.3.14/LICENSE.md).
Fixture values in automated tests are synthetic and do not count as compliance
approval.

## Prepare a release for human review

Follow the clean-candidate checks in the
[release process](release-process.md). Release provenance requires a passing
security report. Set both scanner paths to preexisting trusted executables;
missing tools or failed scans must stop the preparation. This procedure does
not install scanners.

```bash
export AFOL_OSV_SCANNER_PATH=/absolute/path/to/osv-scanner
export AFOL_GITLEAKS_PATH=/absolute/path/to/gitleaks
bun run build
bun run validate:security:release
bun run release:provenance:release
bun run release:sbom-draft
```

The draft is written to `dist/sbom.spdx.draft.json`. It is not an approval.
The reviewer uses its SPDX package identifiers, names, versions, and declared
licenses to collect real license and notice materials and prepare the v2
`compliance-review.json`. The reviewer must account for the Bun runtime
embedded in the executable, including any linked components and relinking
requirements, using actual source materials. The generated inventory alone
does not establish that review.

After the reviewer approves the exact artifact hash, full source commit, Bun
version, license-file hashes, and notice mapping, prepare and verify the
candidate archive:

```bash
bun run release:stage
bun run release:archive -- --stage-dir dist/release/afol-linux-x64
(cd dist/release && sha256sum --check afol-linux-x64.tar.gz.sha256)
```

These commands prepare local release files. They do not publish an asset or
create a release tag.

## Run the local smoke

From the public source checkout, verify an existing staged directory:

```bash
bun run smoke:release-install -- \
  --stage-dir dist/release/afol-linux-x64
```

The smoke verifies the stage, copies the candidate into a fresh temporary
`bin` prefix, checks `afol --version` against staged provenance, and runs the
supported `init`, `qt`, and `status` example in a fresh Git project. It gives
the child process a temporary home and temporary directory. It then replaces
the installed file with the same candidate bytes, restores the known-good
copy, and removes the temporary executable. It installs staged `provenance.json`
as adjacent `bin/afol.provenance.json`, which the binary requires for mutating
commands. Same-candidate replacement and rollback retain this sidecar; uninstall
removes the owned prefix and sidecar. The smoke snapshots project files across
these steps to check that rollback and uninstall preserve project data. Since
the replacement uses the same candidate bytes, this exercises the local
restore and cleanup path and provides no different-version upgrade or
rollback evidence.

The smoke removes only its fresh temporary directory when it exits. It does
not install under the user's home, a global binary directory, or the project.
Linux x64 is the only supported execution target.

## Verify an explicitly published asset

When a release has an actual published directory URL, the downloader mode
requires caller-supplied artifact and full source-commit pins:

```bash
bun run smoke:release-install -- \
  --base-url https://downloads.example.invalid/afol/<version>/linux-x64/ \
  --expected-artifact-sha256 <64-character-sha256> \
  --expected-source-commit-sha <full-source-commit-sha>
```

The example URL is a placeholder and must not be run. Downloader mode accepts
plain HTTPS base URLs without credentials, query strings, or fragments. It
reads the manifest first, checks its pins and safe paths, downloads and
verifies every listed file, then runs the stage verifier before executing the
candidate. It follows at most five HTTPS redirects with credentials omitted
and no authorization, cookie, or referrer headers; signed redirect URLs are
never printed. The supplied base URL is also omitted from output.
Each manifest, file, or archive request has a 60-second deadline shared across
its redirects and response-body read.

Directory mode requires the host to preserve the staged directory tree so paths
such as `licenses/AFOL-LICENSE.txt` resolve beneath the base URL. A host that
exposes only flat release assets does not match this downloader layout. Use
archive mode for a single published archive:

```bash
bun run smoke:release-install -- \
  --archive-url https://assets.example.invalid/afol-linux-x64.tar.gz \
  --expected-archive-sha256 <64-character-archive-sha256> \
  --expected-artifact-sha256 <64-character-artifact-sha256> \
  --expected-source-commit-sha <full-source-commit-sha>
```

The archive URL is also a placeholder. Archive mode checks the caller-pinned
archive hash before decompression, caps expanded TAR data at 1,000,000,000
bytes before parsing, and rejects a nested gzip layer before Bun's archive
parser can decompress it without that cap. It validates every entry path and
file hash, then writes only regular files into the owned temporary stage. The
stage verifier checks the complete result before execution. Archive mode
follows the same bounded HTTPS redirects as directory mode. The archive
producer puts staged files at the archive root and writes an adjacent SHA-256
file; the caller pins that archive hash explicitly. The downloader does not use
the archive library's extraction-to-disk path.

There are currently no published standalone asset URLs or approved real
compliance bundle. Synthetic fixture tests do not prove a published download.
Keep the binary distribution issue open until a human approves the complete
v2 compliance bundle and an actual published asset passes this smoke at its
expected artifact and source-commit pins. The source alpha remains source-only
until that separate review and release decision is complete.
