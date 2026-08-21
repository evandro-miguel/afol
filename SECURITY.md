# Security Policy

## Supported Releases

Security fixes target the latest AFOL prerelease for Linux x64. Older
prereleases and unverified platform builds are not supported.

## Report A Vulnerability

Use the repository's private security-advisory channel. Do not open a public
issue for a suspected vulnerability and do not include credentials, tokens,
private keys, cookies, environment files, or private repository content in a
report.

Include the affected AFOL version, platform, minimal reproduction, expected
behavior, observed behavior, and impact. Redact all sensitive values.

Maintainers should acknowledge a complete report within seven calendar days,
classify severity, and coordinate disclosure after a fix or mitigation is
available. This target is not a guarantee of resolution time.

## Release Security Baseline

Release candidates must pass the repository's Gitleaks and OSV Scanner gates,
produce checksum-bound provenance, and complete the clean-checkout Linux x64
smoke. Missing scanners or unresolved findings block release.
