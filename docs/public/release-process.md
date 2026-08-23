# Release process

Release work is currently local and candidate-oriented. Per ADR-009, this
repository ships no hosted CI workflow; local validation against the exact
candidate SHA is the canonical release evidence. An absent hosted run is not a
pass, failure, or product-status signal.

AFOL is binary-first. A candidate is a Git commit plus compiled assets for the
advertised platform, not an npm package or hosted service.

A complete candidate should include frozen-lockfile install, generated-file
drift checks, lint, type checking, tests, selected critical-surface coverage,
deterministic build verification, secret and dependency scans, artifact smoke,
checksums, and provenance.

Candidate assets may include the platform binary, SHA-256 checksum, provenance,
and SPDX SBOM. Verify the checksum before execution. Provenance names the
source commit and build inputs; it does not prove the software is free of
vulnerabilities.

Run `bun run validate:release` from a clean Linux x64 checkout. WSL2 has
observed local smoke; native Windows remains experimental, and macOS/ARM are
unsupported. Repository visibility changes, release publication, attestations,
and global installation are separate actions and are not claimed by this
document.
