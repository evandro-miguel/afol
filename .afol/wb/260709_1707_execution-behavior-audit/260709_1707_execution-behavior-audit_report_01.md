---
doc_type: report
id: 260709_1707_execution-behavior-audit_report_01
theme: execution-behavior-audit
status: final
owners:
- orchestrator
workstream_intent: Recover project continuity and audit AFOL execution behavior.
artifact_purpose: Record confirmed defects, safe fixes, validation, and the resumption path.
created_at: '2026-07-09T18:30:54-03:00'
updated_at: '2026-07-09T19:01:00-03:00'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
child_spec: 260627_1122_afol-tool-scenario-coverage-and-ux-registry_spec-child_01
related_tasks:
- T-01
- T-02
- T-03
- T-04
- T-05
- T-06
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: 260709_1707_execution-behavior-audit_plan_01
  task: 260709_1707_execution-behavior-audit_task_01
  postmortem: ''
output_artifacts:
  primary:
    report: 260709_1707_execution-behavior-audit_report_01
    task: 260709_1707_execution-behavior-audit_task_01
  sidecars:
    brainstorm: ''
    research: ''
    explorer_check: ''
    postmortem: ''
  sidecar_justification:
    brainstorm: not_required
    research: not_required
    explorer_check: not_required
    postmortem: not_required
---

# Report: execution behavior audit

## Governance Context

- Roadmap feature: `F-11`
- Parent spec: `260521_0110_validation-ci-and-benchmarks_spec_01`
- Child spec: `260627_1122_afol-tool-scenario-coverage-and-ux-registry_spec-child_01`
- Related architecture drift: `260612_workbench-hydration-and-markdown-projection_spec-child_01`

## Summary

The repository was recovered on `dev`, the global AFOL binary was synchronized
with the current build, and a controlled live-agent scenario passed. The audit
confirmed seven high-severity lifecycle integrity defects. These defects were
not changed because they alter canonical lifecycle semantics and require a
separate governed implementation slice.

Three low-risk fixes were implemented. JSON benchmark failures now preserve the
JSON contract, command help for `status`, `evidence`, and `done` works outside a
project, command help for `log` is discoverable through the same path, and the
live integration skill now matches the current single-writer AFOL workflow.

## Confirmed Findings

1. Lifecycle mutations update Markdown but can leave SQLite stale.
2. `doneTask` accepts an earlier success despite a later unresolved failure.
3. Unknown task states can pass strict verification and session closure.
4. Passed evidence with a non-zero exit code is accepted by internal callers.
5. Closed sessions accept later lifecycle mutations.
6. Malformed evidence is omitted from SQLite while freshness validation passes.
7. A downstream write failure can leave an earlier lifecycle artifact committed.
8. One malformed telemetry JSONL line makes query and report unavailable.
9. Six delegated critic attempts failed after Spark quota exhaustion, with no
   automatic model fallback.
10. One orchestrator preflight call omitted its required query and needed a
    corrected retry.

## Agent Execution Evidence

- Controlled scenario: `file-inspection-vs-command`.
- Result: passed.
- Wall-clock time: 11,780 ms.
- Tool interactions: 3.
- Tool success rate: 1.0.
- Retries: 0.
- Output tokens: 392.
- Total tokens including input and cached input: 60,698.
- Command choice: the agent used AFOL instead of direct state-file inspection.

The historical runtime-live snapshot also passed its four recorded scenarios,
but it was generated on 2026-06-07. It must not substitute for the controlled
live result above.

## Delivered Changes

- Emit a structured `afol.result/v1` error envelope for benchmark failures when
  JSON output is requested.
- Route top-level help for `status`, `evidence`, `done`, and `log` before
  project-root discovery and command-specific parsing.
- Update the AFOL integration-test skill to preserve dirty-tree context, use one
  lifecycle writer, use canonical flags, create multi-task reports, and avoid
  destructive reset instructions.

## Files Changed

- `.agents/skills/afol-integration-test/SKILL.md`
- `cli/commands/bench.ts`
- `cli/main.ts`
- `cli/tests/bench-command.test.ts`
- `cli/tests/help.test.ts`
- `.afol/wb/260709_1707_execution-behavior-audit/**`

## Verification

- Focused tests passed: 41 tests, 0 failures, and 853 assertions.

  ```bash
  bun test cli/tests/bench-command.test.ts cli/tests/help.test.ts
  ```

- Full tests: `bun test` -> 936 passed, 0 failed, 7,883 assertions.
- Typecheck: `bun run typecheck` -> passed.
- Formatting and lint passed for all four touched TypeScript files.

  ```bash
  bunx biome check cli/commands/bench.ts cli/main.ts \
    cli/tests/bench-command.test.ts cli/tests/help.test.ts
  ```

- Manifest: `bun run manifest:check` -> passed.
- AFOL project validation: `afol validate project --json` -> passed.
- Project benchmark validation: `afol pb validate --strict --json` -> passed.
- Runtime-live snapshot validation passed: 4 scenarios and 0 failures.

  ```bash
  afol validate bench --pack runtime-live-agent --json
  ```

- Build and dist smoke: executed successfully inside `bun run validate:release`.
- Release security scan: executed successfully inside `bun run validate:release`.
- Release provenance is pending a clean checkout. The first run correctly
  rejected the uncommitted audit patch.
- Diff hygiene: `git diff --check` -> passed.
- GitNexus patch scope: 5 files, 3 symbols, 1 execution flow, medium risk.
- Final critic review found no blocking regression in the tracked patch. It
  required an explicit governed follow-up contract, now recorded below.

## Risks / Follow-ups

- Start an integrity-first lifecycle slice before adding more lifecycle features.
- Separate terminal-state and evidence-resolution fixes from SQLite hydration and
  multi-artifact atomicity to keep regression risk bounded.
- Decide whether malformed telemetry must fail closed or be quarantined before
  changing its parser.
- Add an orchestrator fallback policy for exhausted model tiers.
- Add a live benchmark baseline for total context tokens. Current thresholds
  constrain output tokens, not total input and cached context cost.
- Validate the cross-session index concurrency hypothesis with two simultaneous
  lifecycle mutations before changing index persistence.

## Governed Structural Follow-up

- Status: proposed; implementation requires explicit user approval.
- Owner: `orchestrator`.
- Roadmap feature: `F-18`.
- Governing child spec:
  `260612_workbench-hydration-and-markdown-projection_spec-child_01`.
- Planned session theme: `lifecycle-integrity-hardening`.
- Proposed tasks:
  - `T-01`: add failing tests for unknown task states, later unresolved
    failures, non-zero passed evidence, and post-close mutation.
  - `T-02`: enforce terminal-state and evidence-resolution invariants.
  - `T-03`: make lifecycle mutations hydrate SQLite before returning.
  - `T-04`: add failure-injection tests and atomic multi-artifact persistence.
  - `T-05`: validate focused lifecycle tests, full tests, release validation,
    and state freshness after every mutation.
- Acceptance commands:

  ```bash
  bun test cli/tests/workbench-lifecycle.test.ts cli/tests/state-db.test.ts
  bun run typecheck
  bun test
  afol local-state rebuild --json
  afol validate project --json
  bun run validate:release
  ```

Telemetry parser resilience and orchestrator model-tier fallback remain
separate decisions. They must not expand the lifecycle integrity slice.

## Optional Artifacts

- Brainstorm: not created.
- Research: not created.
- Explorer check: not created.
- Postmortem: not created.

## Output Artifacts (file-first)

- Primary artifact: `260709_1707_execution-behavior-audit_report_01`
- Sidecars: not required.

## Postmortem Link

- Postmortem: not created.

## Lessons

- A passing build does not prove lifecycle integrity. State transitions need
  adversarial ordering, malformed-input, and failure-injection tests.
- Read-only specialist agents should return evidence to one lifecycle writer.
- A model quota failure needs explicit fallback or it silently erodes planned
  review coverage.

---

*Template: `docs/templates/report.md`*
