# Security Policy

## Supported versions

Only the latest published alpha receives security fixes.

## Reporting

Do not open a public issue for a suspected vulnerability. Use GitHub private
vulnerability reporting for this repository. Include the affected version,
reproduction steps, impact, and any proposed mitigation. Do not include real
credentials or user data.

## Scope

AFOL treats the project root, path resolution, symlink handling, subprocess
execution, local mutation journals, locks, release artifacts, and generated
template ownership as security-relevant surfaces.

AFOL is not an authentication boundary between processes running as the same
OS user. Agent and remote modes are restrictive operating profiles, not
identity verification.
