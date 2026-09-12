# Troubleshooting

## Project not found

Run the command inside a Git repository initialized with `afol init`. Confirm
that `.afol/config.json` exists and is valid JSON.

## Task cannot complete

Use `afol s` or `afol status --task-id <id> --json`. Completion requires
observed evidence from a real check:

```bash
afol d T-01 -x "<cmd>"
```

`true` / `:` are shell no-ops and cannot authorize done. Missing `-x` is
rejected. `e` is diagnostic only (receipt without completing); do not use it as
the happy path. `--test-shell "<real check>"` is local-operator-only and must
never be used by an agent or remote/provider execution.

## Close blocked by open tasks

Complete remaining work, then close:

```bash
afol st T-02
afol d T-02 -x "<cmd>"
afol c
```

## Session is pending_spec

That warning does not block start, done, or close. Resolve later with
`afol gov rs -F <F-id> -P <spec-id>` or waive
`afol gov rs --no-spec-required -r "<reason>"`.

## Session context is ambiguous

Omit `-S` on the happy path when an active or bound session resolves. If the
command reports a missing or ambiguous session, pass it explicitly or repair
binding:

```bash
afol st -S <session-id> -T T-01
afol d -S <session-id> -T T-01 -x "<cmd>"
afol c -S <session-id>
afol catchup --fix
```

## Update conflict

Run `afol update check`, then `afol update preview`. AFOL will not silently
overwrite project-owned content. Resolve or accept each ownership conflict
before applying.

## Release verification fails

Confirm the artifact filename, checksum file, provenance file, and SBOM all
belong to the same candidate. Do not rebuild locally and treat that output as
a published artifact without matching candidate provenance.

## `validate:release` fails

Rerun the failing step from the gate output, fix drift, lint, type, test, or
coverage failures, run `bun install --frozen-lockfile` when lockfile or
toolchain drift is reported, and re-run `bun run validate:release` on the
exact candidate SHA.

## Scanner gates fail or are missing

Release scans require `AFOL_OSV_SCANNER_PATH` and `AFOL_GITLEAKS_PATH` to name
absolute paths to operator-approved readable regular scanner files; AFOL rejects
path components reported as symbolic links, non-absolute/missing/non-regular
files, and identity changes during read/revalidation, then executes an
immutable verified byte copy. Release has no PATH fallback. Informative scans
use PATH and may skip absent scanners. Direct `"$AFOL_OSV_SCANNER_PATH"
--version` and `"$AFOL_GITLEAKS_PATH" --version` only check
availability/version and do not validate AFOL path/identity constraints; `bun
run security:scan:release` is the validating command and owns
`dist/security-scan.release.json`. Rerun it or
`bun run validate:security:release` and inspect the report for the recorded
reason.
