# Plan: public-readiness-hardening

## Metadata

- feature_id: F-11
- parent_spec: docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md
- related_specs:
  - docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md
  - docs/arc/SPECS/260426_1215_parallel-session-isolation_spec_01.md
- task: Execute public-readiness blockers found in the readiness review.

## Output Artifacts

- output_artifacts.primary:
  - .afol/wb/260609_2017_public-readiness-hardening/260609_2017_public-readiness-hardening_plan_01.md
  - .afol/wb/260609_2017_public-readiness-hardening/260609_2017_public-readiness-hardening_task_01.md
  - .afol/wb/260609_2017_public-readiness-hardening/.evidence.jsonl
- output_artifacts.sidecars:
  - brainstorm: not_required
  - research: not_required
  - explorer_check: not_required
  - postmortem: not_required
- sidecar_justification:
  - brainstorm: scope is implementation hardening, not ideation.
  - research: local code audit already identified the failing surfaces.
  - explorer_check: GitNexus plus focused local reads are enough for anchors.
  - postmortem: create only if execution exposes a process failure.

## Current Facts

- `afol status --json` reported no active session before this workstream.
- `afol local-state rebuild --json` refreshed the stale files index before planning.
- Readiness audit confirmed seven blockers: missing workbench/journal locks, non-transactional update apply, indistinct update mutation audit, provider-compatible archive under `.agents`, ambiguous validate routing, dist smoke missing update coverage, and CI release security tools not provisioned.
- Local security scanners exist on this host, but CI does not install pinned `osv-scanner` or `gitleaks`.

## Scope

- In scope:
  - Session-scoped locking and locked JSONL append path for workbench and mutation audit.
  - Transactional or rollback-safe `afol update apply`.
  - Mutation audit metadata that distinguishes scaffold update from manual patch.
  - Provider-compatible archive relocation to `.afol/data/migrations`.
  - Explicit validation command UX for project validation vs benchmark validation.
  - Distribution smoke coverage for update check, preview, dry-run, conflict, and one real apply.
  - CI/tool bootstrap for release security scanners.
- Out of scope:
  - Removing `private: true` or claiming public release readiness.
  - Reworking all `node:child_process` usage.
  - Broad advisory/template ownership reclassification unless needed for transaction safety.
  - Public package publishing or cross-platform binary release.

## Risks

- Locking changes touch concurrent agent safety; stale or orphaned locks must fail clearly.
- Update transaction changes can corrupt downstream repos if rollback is incomplete.
- Validate command changes can break existing shorthand expectations; preserve `afol v bench` while making `afol validate` unambiguous.
- CI scanner install can make release slower or flaky if external downloads are not version-pinned.

## Execution Plan

- T-01: Orchestrator. Maintain this workstream, assign slices, integrate patches, run final evidence, and resolve conflicts.
- T-02: Workbench concurrency. Implement lock primitives and apply them to start/evidence/done/log/close plus workbench event append.
- T-03: Mutation journal and update transaction. Add update source/kind metadata, locked journal append, staged update apply, batch rollback, and focused tests.
- T-04: Provider archive and validate UX. Move provider-compatible archive under `.afol/data/migrations`; remove silent validate benchmark auto-switch and add explicit tests.
- T-05: Release smoke and security CI. Extend dist smoke for update flows and pin/provision required scanners in CI or a repo-local bootstrap script.
- T-06: Verifier. Audit changed symbols/flows, run focused and integrated gates, report remaining release blockers.

## Validation

- Focused:
  - `bun test cli/tests/workbench-lifecycle.test.ts cli/tests/log-command.test.ts cli/tests/verify-command.test.ts`
  - `bun test cli/tests/update-command.test.ts cli/tests/mutation-safety.test.ts`
  - `bun test cli/tests/bootstrap-cleanup.test.ts cli/tests/kernel.test.ts cli/tests/validation.test.ts`
  - `bun run smoke:dist`
- Integrated:
  - `git diff --check`
  - `bun run typecheck`
  - `bun test`
  - `afol validate project --json`
  - `afol v bench --pack update-safety --json`
  - `bun run validate:security:required`
  - `bun run validate:release` when focused gates are green.
- Graph/audit:
  - `npx gitnexus impact -r agentic-start-folder <symbol>` before editing any function/class/method.
  - `npx gitnexus detect-changes -r agentic-start-folder` before final closeout.

## Closure Criteria

- All P0 findings from the readiness review are fixed or explicitly moved with destination and reason.
- Each completed task has task-scoped passed evidence in `.evidence.jsonl`.
- Final report states changed files, validation, remaining risk, docs drift, and mirror/template sync status.
