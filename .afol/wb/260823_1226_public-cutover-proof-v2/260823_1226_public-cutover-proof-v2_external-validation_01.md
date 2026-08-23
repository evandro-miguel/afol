# External Validation Trace: Public Cutover

## Target

- Canonical public repository: `/home/ozy/01_projects/dev/afol/afol.public`
- Fresh external clone: `/home/ozy/tmp/afol-public-observed-09fd89fd`
- Clone mode: `git clone --no-local`
- Exact public commit: `09fd89fda14c40c5a4fd8a3160510e22670ec3bc`
- Reachable public history: one commit
- Worktree after validation: clean

## Observed Execution

- Harness: `codex-shell`
- Fixed AFOL harness profile: `tester`
- Command: `bun run validate:release`
- Started: `2026-08-23T17:20:53Z`
- Finished: `2026-08-23T17:23:42Z`
- Exit code: `0`
- Test result within the release gate: 459 passed, 0 failed
- Security result: OSV Scanner passed; Gitleaks passed

The release command used the approved absolute local paths for OSV Scanner
2.5.0 and Gitleaks 8.30.1. No credential or secret value was read or recorded.

## Bound Artifacts

- `dist/afol`:
  `a845fc825a7681ac19c2d361811978eaf93fd5ab7f5d5a533747d531c6ba6271`
- `dist/afol.provenance.json`:
  `9824ba3a38579496256b8419c18d1d535f1907448047a3c43f3fa4575bfca11c`
- `dist/security-scan.release.json`:
  `897f44b9a94af41ca3c12371d7cdc23d42b41c1930ddd199e753ed33785de7a6`
- `dist/afol.sha256`:
  `38e4e934c5fc1f40055743019ba7c00467489993d5121c4ffee4520aac8b0228`
- `bun.lock`:
  `ac37b476909feda0d9aea4a577e0a27d6e1c8627d55db6badaf70244210c0e3f`

The provenance document records the exact public commit above and passed
`deps`/`osv-scanner` and `secrets`/`gitleaks` scanner statuses. This is local
evidence only; it does not claim a remote, publication, hosted CI, attestation,
or global installation.
