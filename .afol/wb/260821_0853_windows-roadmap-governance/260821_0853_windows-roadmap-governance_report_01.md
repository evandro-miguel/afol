# Report: 260821_0853_windows-roadmap-governance

## Summary
declared: Added Windows-safe flat roadmap resolution, CRLF-stable spec and manifest parsing, reparse-point protection, and fail-safe parent-to-roadmap activation convergence.

## Tasks
- T-01: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260821092643238-1a80a2: passed (bun test cli/tests/generate-manifest.test.ts cli/tests/spec-gate-system.test.ts cli/tests/governance-command.test.ts cli/tests/quick-task-command.test.ts; exit_code=0)
- T-01 attempt=1 evidence_id=E-20260821092644617-358d59: passed (bun run typecheck; exit_code=0)
- T-01 attempt=1 evidence_id=E-20260821092645154-b7a1d5 authorizing: passed (bun run manifest:check; exit_code=0)
