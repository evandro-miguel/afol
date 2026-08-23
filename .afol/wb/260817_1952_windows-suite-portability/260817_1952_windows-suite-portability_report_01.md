# Validation Trace: 260817_1952_windows-suite-portability

This trace records exact-SHA validation for T-04. It does not create an AFOL
receipt or mutate lifecycle state.

## Candidate and isolation

- Source checkout: `/home/ozy/01_projects/dev/afol/afol.dev`
- Candidate commit: `f53c7d8e3eb136252469f68725ad239107988954`
- Candidate tree: `97bb92322b2cac84632621440cda8761d220d953`
- Commit time: `2026-08-23T12:50:54-05:00`
- Clean clone: `/home/ozy/tmp/afol-windows-validation-f53c7d8e-vV4Lsn/clone`
- Clone method: `git clone --no-local`; clone created at
  `2026-08-23T12:55:56-05:00`
- Clone branch/status: `dev [synced]`, no changed paths; Git alternates file
  absent
- Bun/package manager: `1.3.14` / `bun@1.3.14`
- `bun.lock` SHA-256:
  `4f10c2497f475e4e10d2eabdcd18396207edab14824bbf5174ec8d95f8ce5e09`

## Commands and observed results

| Category | Command/result | Observed time (America/Chicago) |
| --- | --- | --- |
| Install | `bun install --frozen` — exit 0 | 12:56:24 |
| Focused suites | 11 suites; 247 pass, 2 skip, 0 fail | 12:56:29–12:57:23 |
| Typecheck | `bun run typecheck` — exit 0 | 12:57:27–12:57:28 |
| Build | `bun run build` — exit 0 | 12:57:32–12:57:33 |
| Security, sandboxed | exit 1 (OSV DNS) | 12:57:48–12:58:16 |
| Security, reviewed retry | exit 0 | 12:58:27–12:58:32 |
| Full release, first attempt | exit 124 after timeout | timestamp not emitted |
| Release coverage probe | 294 pass, 0 fail | 13:09:48–13:10:03 |
| Full release, retry | exit 0 | 13:10:15–13:13:58 |

The focused command covered `windows-runtime`, `reproducible-build`,
`clean-smoke`, `session-lock`, `completion-lock`, `security-scan`,
`release-toolchain`, `validate-internals`, `template-policy`, `update-command`,
and `validate-command`. The two skipped tests were session-lock EPERM
transitions requiring platform-specific behavior. The focused batch ran 249
tests total.

The first security attempt was blocked by sandbox DNS while OSV Scanner queried
`api.osv.dev` (status 127), not by a vulnerability finding. The reviewed
network retry passed OSV Scanner and Gitleaks. The first full release attempt
reached the coverage stage and timed out; the exact release coverage matrix
then passed independently in 16 seconds, and the complete release retry passed
all remaining stages.

The first full attempt was bounded at 600 seconds (exit 124, with no start
timestamp emitted by the timed-out wrapper).

The release commands were `bun run validate:security:release` (sandboxed exit
1, reviewed retry exit 0) and `bun run validate:release` (first attempt exit
124, retry exit 0).

## Scanner identities

- OSV Scanner 2.5.0:
  `/home/ozy/.local/share/mise/installs/go-github-com-google-osv-scanner-v2-cmd-osv-scanner/2.5.0/bin/osv-scanner`
  SHA-256:
  `89a402e6ddd58a3b1b415f9b383b7990b22da5cb57ceb8b05c0fe4f29d3b52e9`
- Gitleaks 8.30.1:
  `/home/ozy/.local/share/mise/installs/go-github-com-zricethezav-gitleaks-v8/8.30.1/bin/gitleaks`
  SHA-256:
  `2faa0489c2d24d36b860913a3557cd816cba6b3f5e27348c0ad8170892855023`

## Artifact binding

- `dist/afol`: 96,213,120 bytes
- Artifact SHA-256:
  `65749781edcb2af0f717f5893c0fe6802dddc456b69ad05f562df57c6f5753b9`
- Template hash:
  `6df8ef1fd37da94afdd5f522615160c3b81440d4487d2027f166eb20a43e8d93`
- Release provenance binds the candidate commit, artifact hash, lockfile hash,
  Linux x64 platform, Bun 1.3.14, minified/no-bytecode build, and both passing
  scanner identities.
- Final release stages included deterministic build, release provenance,
  distribution smoke, and clean smoke.

## Boundary

No native Windows runner was available. Per the governing readiness spec,
native Windows is experimental and non-gating; this trace proves the Linux x64
exact-SHA release path and Windows-focused runtime tests, not native Windows
support or hosted CI readiness.
