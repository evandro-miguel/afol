# Changelog

All notable public changes will be documented here. This project follows
Semantic Versioning while in alpha.

## [Unreleased]

- Separate source publication from standalone-binary distribution.
- Add a fresh-history public publishing checklist.
- Document the binary checksum, SBOM, license, and relinkability gates.
- Clarify source installation and the source-only alpha path.
- Make evidence-transition admission and lifecycle close atomic under the
  session lock.
- Keep evolution analysis read-only through disposable SQLite snapshots.
- Propagate durability failures, stream large state journals, and bound help,
  UX, health, and local-state JSON output.
- Add fail-closed Linux x64 release staging with final asset checksums,
  provenance, security evidence, SPDX SBOM, manifests, and reviewed licenses.
- Audit public links, examples, current content, and reachable history while
  retaining exact synthetic-test canaries only.

## [0.1.0-alpha.1]

- Establish the sanitized public repository boundary.
- Add command stability metadata.
- Bind release provenance to `package.json` and the exact build artifact.
- Keep native Windows experimental; no hosted runner evidence is claimed.
- Initial public alpha candidate.
