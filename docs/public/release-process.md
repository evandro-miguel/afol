# Release process

Public releases are binary-first and generated only by GitHub Actions from a
validated tag.

The release gate performs frozen dependency installation, generated-file drift
checks, lint, type checking, tests, selected critical-surface coverage,
deterministic build verification, Gitleaks, OSV Scanner, artifact smoke,
clean-checkout smoke, checksum generation, and provenance generation.

Published assets include the platform binary, SHA-256 checksum, provenance,
and SPDX SBOM. Verify the checksum before execution. Artifact attestation proves
which workflow and source produced an asset; it does not prove the software is
free of vulnerabilities.

Timing measurements on hosted runners are observational unless a controlled
host profile is part of the evidence.
