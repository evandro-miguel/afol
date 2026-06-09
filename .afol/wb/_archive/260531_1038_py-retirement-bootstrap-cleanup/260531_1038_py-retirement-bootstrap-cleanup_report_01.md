---
doc_type: report
id: 260531_1038_py-retirement-bootstrap-cleanup_report_01
theme: py-retirement-bootstrap-cleanup
status: active
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Capture delegated execution results, validation evidence, and final
  handoff.
created_at: 2026-05-31 10:42:00-03:00
updated_at: '2026-05-31T10:45:09-03:00'
roadmap_feature: F-00
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  plan: 260531_1038_py-retirement-bootstrap-cleanup_plan_01
  task: 260531_1038_py-retirement-bootstrap-cleanup_task_01
---

# Report: py-retirement-bootstrap-cleanup

## STATUS

Implemented and validated in the scoped workstream. Task closure evidence is
being recorded through governed automation.

## TASK

Retire Python/UV scaffold dependency from public bootstrap/update cleanup flows
while preserving safe migration of older downstream repos.

## ORCHESTRATION

- Workbench session id `260531_1038_py-retirement-bootstrap-cleanup`
- Model tier requested: `gpt-5.3-codex-spark`
- Agent roster:
  - Agent A / bootstrap cleanup: completed.
  - Agent B / native CLI routing: completed.
  - Agent C / docs-gates: completed.

## VALIDATION_OR_CHECKS

Executed gates:

- `bun test cli/tests/bootstrap*.test.ts cli/tests/kernel.test.ts cli/tests/workbench-lifecycle.test.ts cli/tests/template-policy.test.ts cli/tests/bootstrap-template-cleanliness.test.ts` -> 32 pass, 0 fail.
- `bun run typecheck` -> pass.
- `bun run validate:template` -> 6 pass, 0 fail.
- `bun run validate:bootstrap` -> 6 pass, 0 fail.
- `bun test cli/tests/downstream-smoke.test.ts` -> 1 pass, 0 fail.
- `bun test` -> 74 pass, 0 fail.
- `npx gitnexus detect-changes --repo agentic-standard-folder` -> completed, risk level critical because current dirty diff spans 27 files, 121 symbols, and 28 flows.
- `./.agents/agents verify-tasks .agents/wb/260531_1038_py-retirement-bootstrap-cleanup --strict` -> expected fail before task closure; rerun after evidence closure.

## Summary

Current code prevents new Python payload export but does not clean old Python
payloads from adopted repos. This workstream closes that gap through explicit,
safe cleanup planning and applies only after verification.

Delivered outcome:

- Older downstream targets can now run bootstrap/init with explicit legacy
  cleanup planning for Python scaffold payloads.
- `new --help` is safe/read-only and native; governed metadata flags no longer
  require the Python wrapper for this creation path.
- Canonical docs now state that Python/UV roots are internal factory fallback,
  not public runtime.

## Delivered Changes

- Added `cli/services/bootstrap/cleanup.ts`.
- Updated `cli/commands/bootstrap.ts` to report `cleanup-pending` candidates and
  remove them only with `--cleanup-obsolete`.
- Updated `cli/commands/init.ts` to forward `--cleanup-obsolete`.
- Updated `cli/main.ts`, `cli/commands/workbench.ts`, and
  `cli/services/workbench/lifecycle.ts` for native `new --help` and governed
  metadata flags.
- Added `cli/tests/bootstrap-cleanup.test.ts` and expanded
  `cli/tests/kernel.test.ts`.
- Updated `AGENTS.md`, `CLAUDE.md`, `docs/arc/TECH-STACK.md`,
  `docs/arc/SPECS/260531_0000_template-cli-boundary-hardening_spec_01.md`,
  `docs/map/README.md`, `docs/map/ARCHITECTURE.md`,
  `docs/map/structure/backend.md`, and `docs/map/structure/README.md`.

Implemented behavior:

- `bootstrap` now reports legacy cleanup candidates and supports explicit
  `--cleanup-obsolete` apply behavior.
- `init` forwards `--cleanup-obsolete`.
- `new --help` is now native/read-only and does not create a session.
- `new` accepts governed metadata flags needed by this workstream.
- Docs now distinguish public TS runtime from root factory Python fallback.

## Verification

- `bun test cli/tests/bootstrap*.test.ts cli/tests/kernel.test.ts cli/tests/workbench-lifecycle.test.ts cli/tests/template-policy.test.ts cli/tests/bootstrap-template-cleanliness.test.ts` -> passed, 32 tests.
- `bun run typecheck` -> passed.
- `bun run validate:template` -> passed, 6 tests.
- `bun run validate:bootstrap` -> passed, 6 tests.
- `bun test cli/tests/downstream-smoke.test.ts` -> passed, 1 test.
- `bun test` -> passed, 74 tests.
- `npx gitnexus detect-changes --repo agentic-standard-folder` -> completed,
  risk critical for the combined dirty worktree.

## BLOCKERS

- No scoped validation blocker.
- Repository has unrelated dirty files from other sessions/spec work; do not
  treat this workstream as a clean commit boundary without separating those
  changes.
- GitNexus affected-scope risk is `critical`; this is expected for the combined
  dirty worktree and must be reviewed before commit/merge.

## NEXT

- Record task evidence and close T-01 through T-04.
- Rerun strict task verification for this session.
- If committing, isolate unrelated dirty docs/session state first.
