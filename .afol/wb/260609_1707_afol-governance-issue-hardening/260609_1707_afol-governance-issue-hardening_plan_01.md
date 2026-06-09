# Plan: afol-governance-issue-hardening

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-04
- parent_spec: 260521_0040_governance-workbench-system_spec_01
- task: Fix audit findings: verifier boundary, stale local-state closeout, legacy-doc drift, and benchmark refresh guidance

## Execution Plan

- T-01: Fix audit findings from the 2026-06-09 governance audit.
- Code slice:
  - Keep `verify-tasks --strict` from treating discontinued root `.agents/wb/`
    history as current repo work.
  - Enforce a safe project/workbench boundary for verify session path inputs.
  - Treat malformed workbench index `generated_at` values as invalid instead of
    silently fresh.
  - Replace legacy Python benchmark refresh guidance with an AFOL-native path.
- Docs slice:
  - Replace active `.agents/agents`, Python script, and legacy just-runner usage
    examples with `afol` or explicit migration-debt wording.
  - Preserve factory-only legacy references only where the text is explicitly
    about migration or retirement.
- Local-state slice:
  - Rebuild generated local-state indexes after code/docs changes.
  - Verify `.afol/wb/` strict closeout separately from root legacy history.

## Validation

- `gitnexus impact` before symbol edits and `gitnexus detect-changes` before
  closeout.
- Focused tests for verifier, local-state, validation, and docs-sensitive
  behavior.
- `bun run typecheck`
- `bun test`
- `bun run validate:toolchain`
- `bun run validate:release`
- `./afol local-state rebuild`
- `./afol local-state freshness`
- `./afol validate project`
- `./afol verify-tasks --strict`

## Closure Criteria

- T-01 is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
- Final git status distinguishes tracked changes from ignored generated output.
