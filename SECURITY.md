# Security Policy

## Supported alpha

Security fixes target the current AFOL alpha for Linux x64. Older alpha
snapshots and unverified platform builds are not supported.

The alpha is source-only. A local build is not a published artifact; do not
attach binaries or publish packages from an ordinary contribution.

## Report a vulnerability

Use the repository's private security-advisory channel. Do not open a public
issue for a suspected vulnerability and do not include credentials, tokens,
private keys, cookies, environment files, or private repository content in a
report.

Include the affected AFOL version, platform, minimal reproduction, expected
behavior, observed behavior, and impact. Redact all sensitive values.

## Scope

AFOL treats the project root, path resolution, symlink handling, subprocess
execution, local mutation journals, locks, release artifacts, and generated
template ownership as security-relevant surfaces.

AFOL is not an authentication boundary between processes running as the same
OS user. Agent and remote modes are restrictive operating profiles, not
identity verification.

## Local release security baseline

Release-affecting changes must pass the local Gitleaks and OSV Scanner gates,
produce checksum-bound provenance, and complete the clean-checkout Linux x64
smoke. Hosted CI and GitHub repository security features add regression and
repository-level defenses, but they do not replace these local exact-SHA gates
or imply release authorization. Missing scanners or unresolved findings block
the candidate.
