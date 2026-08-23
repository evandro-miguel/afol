# Report: 260823_1716_windows-candidate-provenance-separator

## Summary
closed: 2 tasks; evidence: 5 observed, 3 failed

## Tasks
- T-01: done
- T-02: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260823172039914-b8dba1: declared passed (bun run typecheck; bun x biome check cli/dev/build-release.ts cli/dev/security-scan.ts cli/dev/release-provenance.ts cli/tests/reproducible-build.test.ts cli/tests/release-toolchain.test.ts cli/tests/security-scan.test.ts; bun x oxlint cli/dev/build-release.ts cli/dev/security-scan.ts cli/dev/release-provenance.ts cli/tests/reproducible-build.test.ts cli/tests/release-toolchain.test.ts cli/tests/security-scan.test.ts; git diff --check; exit_code=n/a)
- T-01 attempt=1 evidence_id=E-20260823172041108-56e1b5 authorizing: passed (bun test cli/tests/reproducible-build.test.ts cli/tests/release-toolchain.test.ts cli/tests/security-scan.test.ts --test-name-pattern "accepts Windows receipt|canonicalizes a Windows candidate|rejects unsafe release artifact|binds an explicit Windows candidate"; exit_code=0)
- T-01 attempt=1 evidence_id=E-20260823172049332-fab034: declared passed (bun run security:scan:informative; exit_code=n/a)
- T-01 attempt=1 evidence_id=E-20260823172114457-0e7f15: declared passed (bun test cli/tests/reproducible-build.test.ts --test-name-pattern "accepts Windows receipt"; bun run typecheck; bun x biome check cli/dev/build-release.ts cli/dev/security-scan.ts cli/dev/release-provenance.ts cli/tests/reproducible-build.test.ts cli/tests/release-toolchain.test.ts cli/tests/security-scan.test.ts; bun x oxlint cli/dev/build-release.ts cli/dev/security-scan.ts cli/dev/release-provenance.ts cli/tests/reproducible-build.test.ts cli/tests/release-toolchain.test.ts cli/tests/security-scan.test.ts; git diff --check; exit_code=n/a)
- T-02 attempt=1 evidence_id=E-20260823173305923-104686: declared failed (D:\tools\bin\bun.exe run manifest:check (expected candidate preflight; failed: src/project-template/.agents/manifest.json and lock.json out of sync); exit_code=n/a)
- T-02 attempt=1 evidence_id=E-20260823175641733-9317c6: declared failed (attempt 2 candidate 6743be6f: dist/afol.exe init isolated smoke --provider-compatible (failed: Refusing real bootstrap: missing or invalid package metadata at B:\\package.json); exit_code=n/a)
- T-02 attempt=1 evidence_id=E-20260823180824243-f179fe: failed (powershell.exe -NoProfile -NonInteractive -File D:\projects\active\afol-f20-windows-provenance\.afol\tmp\candidate-t02-observed-check.ps1 -Mode provenance; exit_code=1)
- T-02 attempt=1 evidence_id=E-20260823180953428-914d6b: passed (powershell.exe -NoProfile -NonInteractive -File D:\projects\active\afol-f20-windows-provenance\.afol\tmp\candidate-t02-observed-check.ps1 -Mode provenance; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260823180954592-7ee4e5: passed (powershell.exe -NoProfile -NonInteractive -File D:\projects\active\afol-f20-windows-provenance\.afol\tmp\candidate-t02-observed-check.ps1 -Mode normal; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260823180956412-e1d0a1 authorizing: passed (powershell.exe -NoProfile -NonInteractive -File D:\projects\active\afol-f20-windows-provenance\.afol\tmp\candidate-t02-observed-check.ps1 -Mode recovery; exit_code=0)
