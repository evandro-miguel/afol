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

`bun run validate:release` is the repository-local distribution/release gate.
Its current package-script chain runs:

- version, manifest, Biome, Oxlint, Knip, and toolchain-diff checks;
- local-state rebuild, project validation, and the blocking
  `bun run typecheck` step;
- template, bootstrap, project-benchmark, UX-governance, token-economy, and
  local-kernel benchmark checks;
- the configured failure-focused test step (`bun run test:full`, currently
  `bun test --only-failures`) and `bun run coverage:check` (≥80% lines and
  functions);
- the deterministic build, release security scan, release provenance,
  distribution smoke, and clean-checkout smoke.

The release claim is limited to the observed Linux x64 path. CI is pinned to
an Ubuntu 24.04 x64 runner. WSL2 smoke is a separate observed local check and
must be recorded independently; neither static checks nor Ubuntu CI establish
Windows, macOS, or ARM support.

The gate includes project validation and the TypeScript typecheck; standalone
preflight invocations remain useful for faster diagnosis. It does not include
the release-scoped AFOL health check or the observed WSL2 smoke, so this
runbook keeps those as separate local checks. The manifest check is also part
of `validate:toolchain` and may be run early to catch registry drift sooner.

## Required Tools on PATH

| Tool | Purpose | Required for Real Release |
| --- | --- | --- |
| `bun` | Runtime, test runner, bundler | Yes |
| `afol` | Post-install global smoke | No; authorized `main` only |
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

Use the repository-local kernel and `dist/afol` candidate for every
pre-promotion step. This flow does not install or replace the global binary.
Global installation is a separate operation allowed only after the exact
artifact is integrated into `main` and the user explicitly authorizes it.

1. Start from a clean checkout of the exact product commit and record its
   branch and SHA.
2. Install dependencies with `bun install --frozen-lockfile`.
3. Verify generated version metadata with `bun run version:check`.
4. Check CLI manifest drift with `bun run manifest:check`.
5. Run the blocking standalone typecheck with `bun run typecheck` for early
   diagnostics; `validate:release` runs it again in its own chain.
6. Rebuild AFOL local state with `bun run local-state:rebuild`.
7. Validate the project with `bun run validate:project`.
8. Check release health with the local kernel:
   `bun run kernel -- health --release --json`.
9. Run `bun run validate:release`; it generates the final candidate, security,
   checksum, and provenance artifacts.
10. On an observed WSL2 shell, run `bun run smoke:wsl2` separately and retain
    its output as WSL2 evidence; do not merge it with Ubuntu CI evidence.
11. Record the observed exit code and retained log/artifact as AFOL evidence.
12. After authorized `main` integration and installation of that exact
    candidate, verify the global binary's non-symlink status, version, SHA-256
    equality, and an outside-checkout help smoke. This is the only global
    smoke step; it is not a `dev` validation shortcut.
13. Close the session only after evidence is attached and no tasks remain open.

A different global `afol` version or hash while working on `dev` is expected.
Do not repair it from a development worktree or use it as the candidate gate.

```bash
bun install --frozen-lockfile
bun run version:check
bun run manifest:check
bun run typecheck
bun run local-state:rebuild
bun run validate:project
bun run kernel -- health --release --json
bun run validate:release
# Run separately on an observed WSL2 shell when WSL2 evidence is required.
bun run smoke:wsl2
```

### Artifacts Produced

- `dist/afol` — standalone binary
- `dist/afol.build.json` — checksum-bound compiled-build receipt
- `dist/afol.sha256` — checksum (format: `<sha256>  dist/afol`)
- `dist/afol.provenance.json` — provenance including version, commit, lockfile hash, template hash, platform, arch, Bun target, disabled standalone `.env`/`bunfig.toml` autoload policy, and security scanner outcomes
- `dist/security-scan.release.json` — release scanner versions and pass/waiver
  status. Required scanners may not be silently waived.

## Coverage Threshold

≥80% lines and functions (enforced by `cli/dev/coverage-check.ts` constant `THRESHOLD = 80`).

## References

- **ADR-005** — Canonical authority transfer from `docs/arc/**` to `.afol/adm/**`
- **F-11 Spec** — `.afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md` (validation gate, coverage, security waivers)
- **F-12 Spec** — `.afol/adm/specs/260521_0120_public-distribution-and-onboarding_spec_01.md` (reproducible install, binary smoke, checksum/provenance)
- **GENERAL-ROADMAP MVP** — Security waiver policy (F-11 MVP note), public distribution gate (F-12 MVP note)
