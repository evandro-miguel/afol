# Report: Provider-neutral GitNexus cleanup

## Summary

Aligned the repository agent contract with the disabled Claude adapter while
preserving the intentional AFOL continuity updates already present in
`AGENTS.md`.

## Delivered Changes

- Archived the untracked `CLAUDE.md` and `.claude/skills/gitnexus/**` artifacts
  through AFOL file mutations, then removed their empty source directories.
- Replaced the generated provider-specific GitNexus block with concise,
  provider-neutral guidance that routes operators to the global skill.
- Preserved the existing AFOL migration, governance, State DB v1, and
  validation guidance in `AGENTS.md`.
- Captured the execution plan, task state, validation evidence, and independent
  architecture, quality, and reliability reviews in this workbench session.

## Files Changed

- `AGENTS.md`
- `.afol/wb/260709_1643_provider-neutral-gitnexus-cleanup/**`

## Verification

- `gitnexus detect-changes -r afol-dev --scope unstaged` -> passed; local scope
  was LOW risk with zero affected execution flows.
- `./afol local-state rebuild --json` -> passed.
- `./afol validate project --json` -> passed with 21 checks.
- `bun run manifest:check` -> passed.
- `bun run typecheck` -> passed.
- `bun test` -> passed with 935 tests and zero failures.
- `bun run validate:release` -> passed on clean commit `7dbac1c`, including
  deterministic build, distribution smokes, Gitleaks, OSV, and release
  provenance.

## Risks / Follow-ups

- GitNexus comparison against `main` remains CRITICAL because the complete
  `dev` branch differs by 86 files and 71 execution flows. This is historical
  branch divergence, not the local cleanup; the scoped local analysis reported
  LOW risk and zero affected flows.
- No implementation blocker remains in this cleanup scope.
