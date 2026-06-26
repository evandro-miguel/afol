---
doc_type: runbook
id: release_runbook_01
status: active
owners: ["orchestrator"]
created_at: "2026-06-14T00:00:00+00:00"
updated_at: "2026-06-14T00:00:00+00:00"
---

# RELEASE RUNBOOK

## Purpose

`bun run validate:release` is the distribution/release artifact gate. It proves:

- All tests pass with coverage ≥80% lines and functions (`bun run coverage:check`)
- Deterministic build succeeds (`bun run build:deterministic`)
- Distribution binary smokes (`bun run smoke:dist`)
- Security scans execute (or are explicitly waived) (`bun run validate:security:release`)
- Release provenance is generated (`bun run release:provenance:release`)

It does not currently run the AFOL project hygiene gate or the TypeScript
typecheck, so both are explicit release preflight commands in this runbook.

## Required Tools on PATH

| Tool | Purpose | Required for Real Release |
|------|---------|---------------------------|
| `bun` | Runtime, test runner, bundler | Yes |
| `afol` | Local CLI wrapper (resolves via `package.json` bin) | Yes |
| `osv-scanner` (or `osv`) | Dependency vulnerability scan | Yes |
| `gitleaks` | Secret scan | Yes |

**Waiver behavior** (per `cli/dev/security-scan.ts` and F-11 addendum):

- If `osv-scanner` is absent, the dependency scan status is `waived` with `waiver_required: true`
- If `gitleaks` is absent, the secret scan status is `waived` with `waiver_required: true`
- The release gate **passes** but security scans are **WAIVED, not executed**
- A credible public release requires both tools present on PATH

## Release Flow

Use this order before any global update/install or release promotion:

1. Check the running wrapper version with `afol --version` and compare it to
   the repo release metadata.
2. Verify generated version metadata with `bun run version:check`.
3. Rebuild AFOL local state with `afol local-state rebuild --json`.
4. Validate the project with `afol validate project --json`.
5. Run `bun run typecheck`.
6. Generate release provenance with `bun run release:provenance:release`.
7. Run the release gate with `bun run validate:release`.
8. Record AFOL evidence for the gated session/task.
9. Close the session only after evidence is attached and no tasks remain open.

Do not run global update/install when `afol --version` diverges from the repo
version and that version has no registered release provenance. Keep the work
local until the repo release path is proven.

```bash
bun install --frozen-lockfile
afol local-state rebuild --json
afol validate project --json
bun run typecheck
bun run validate:release
```

### Artifacts Produced

- `dist/afol` — standalone binary
- `dist/afol.sha256` — checksum (format: `<sha256>  dist/afol`)
- `dist/afol.provenance.json` — provenance including version, commit, lockfile hash, template hash, platform, arch, and security scanner outcomes

## Coverage Threshold

≥80% lines and functions (enforced by `cli/dev/coverage-check.ts` constant `THRESHOLD = 80`).

## References

- **ADR-005** — Canonical authority transfer from `docs/arc/**` to `.afol/adm/**`
- **F-11 Spec** — `.afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md` (validation gate, coverage, security waivers)
- **F-12 Spec** — `.afol/adm/specs/260521_0120_public-distribution-and-onboarding_spec_01.md` (reproducible install, binary smoke, checksum/provenance)
- **GENERAL-ROADMAP MVP** — Security waiver policy (F-11 MVP note), public distribution gate (F-12 MVP note)
