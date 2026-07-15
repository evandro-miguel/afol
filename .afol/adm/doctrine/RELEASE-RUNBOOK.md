---
doc_type: runbook
id: release_runbook_01
status: active
owners: ["orchestrator"]
created_at: "2026-06-14T00:00:00+00:00"
updated_at: "2026-07-13T00:00:00+00:00"
---

# RELEASE RUNBOOK

## Purpose

`bun run validate:release` is the distribution/release artifact gate. It proves:

- All tests pass with coverage ≥80% lines and functions (`bun run coverage:check`)
- Deterministic build succeeds (`bun run build:deterministic`)
- Distribution binary smokes (`bun run smoke:dist`)
- Security scans execute and pass (`bun run validate:security:release`)
- Release provenance is generated (`bun run release:provenance:release`)

It does not currently run the AFOL project hygiene gate, the AFOL release
health check, or the TypeScript typecheck as standalone preflights, so those
are explicit release preflight commands in this runbook. The manifest check is
also run explicitly so command registry drift is caught before release.

## Required Tools on PATH

| Tool | Purpose | Required for Real Release |
|------|---------|---------------------------|
| `bun` | Runtime, test runner, bundler | Yes |
| `afol` | Compiled global CLI at `$HOME/.local/bin/afol` | Yes |
| `osv-scanner` (or `osv`) | Dependency vulnerability scan | Yes |
| `gitleaks` | Secret scan | Yes |

**Waiver behavior** (per `cli/dev/security-scan.ts` and F-11 addendum):

- If `osv-scanner` is absent, the dependency scan status is `waived` with `waiver_required: true`
- If `gitleaks` is absent, the secret scan status is `waived` with `waiver_required: true`
- The release gate **fails** when a required release scanner is absent, cannot
  start, reports findings, or when no supported dependency lockfile exists
- A credible public release requires both tools present on PATH and a passing
  dependency scan result

## Release Flow

Use this order before any global update/install or release promotion:

1. Check the installed binary with `command -v afol`, verify it is not a
   symlink, and compare `afol --version` to the repo release metadata. `./afol`
   and `dist/afol` are repository-local development/build surfaces only.
2. Verify generated version metadata with `bun run version:check`.
3. Install dependencies with `bun install --frozen-lockfile`.
4. Run `bun run typecheck`.
5. Check CLI manifest drift with `bun run manifest:check`.
6. Rebuild AFOL local state with `afol local-state rebuild --json`.
7. Validate the project with `afol validate project --json`.
8. Check release health with `afol health --release --json`.
9. Run `bun run validate:release` from a clean checkout of the exact product
   commit; it generates the final security and provenance artifacts.
10. Record the observed exit code and retained log/artifact as AFOL evidence.
11. Install `dist/afol` as a real executable only after the artifact gate.
12. Verify installed/artifact SHA-256 equality, non-symlink status, version,
    and an outside-repository help smoke.
13. Close the session only after evidence is attached and no tasks remain open.

Do not run global update/install when `afol --version` diverges from the repo
version and that version has no registered release provenance. Keep the work
local until the repo release path is proven.

```bash
bun install --frozen-lockfile
bun run typecheck
bun run manifest:check
afol local-state rebuild --json
afol validate project --json
afol health --release --json
bun run validate:release
bun run smoke:clean
test ! -L "$(command -v afol)"
afol --version
```

### Artifacts Produced

- `dist/afol` — standalone binary
- `dist/afol.sha256` — checksum (format: `<sha256>  dist/afol`)
- `dist/afol.provenance.json` — provenance including version, commit, lockfile hash, template hash, platform, arch, and security scanner outcomes
- `dist/security-scan.release.json` — release scanner versions and pass/waiver
  status. Required scanners may not be silently waived.

## Coverage Threshold

≥80% lines and functions (enforced by `cli/dev/coverage-check.ts` constant `THRESHOLD = 80`).

## References

- **ADR-005** — Canonical authority transfer from `docs/arc/**` to `.afol/adm/**`
- **F-11 Spec** — `.afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md` (validation gate, coverage, security waivers)
- **F-12 Spec** — `.afol/adm/specs/260521_0120_public-distribution-and-onboarding_spec_01.md` (reproducible install, binary smoke, checksum/provenance)
- **GENERAL-ROADMAP MVP** — Security waiver policy (F-11 MVP note), public distribution gate (F-12 MVP note)
