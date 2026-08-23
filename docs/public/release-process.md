# Release process

Public releases are binary-first. A release is a Git tag plus compiled assets
for the advertised platforms.

A complete candidate should include frozen-lockfile install, generated-file
drift checks, lint, type checking, tests, selected critical-surface coverage,
deterministic build verification, secret and dependency scans, artifact smoke,
checksums, and provenance.

Published assets include the platform binary, SHA-256 checksum, provenance,
and SPDX SBOM when those files are attached to the tag. Verify the checksum
before execution. Provenance names the source commit and build inputs; it does
not prove the software is free of vulnerabilities.

Hosted automation is optional operator infrastructure. Local `bun run
validate:release` is the in-repo gate. Do not treat a missing or red hosted
run as the product contract.
