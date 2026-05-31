---
doc_type: plan
id: 260531_1038_py-retirement-bootstrap-cleanup_plan_01
theme: py-retirement-bootstrap-cleanup
status: active
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Define the concrete execution path for work that will actually be
  performed.
created_at: 2026-05-31 10:38:08-03:00
updated_at: '2026-05-31T10:45:09-03:00'
roadmap_feature: F-00
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  task: 260531_1038_py-retirement-bootstrap-cleanup_task_01
  report: 260531_1038_py-retirement-bootstrap-cleanup_report_01
  brainstorm: null
  explorer_check: null
  research: null
  postmortem: null
repo: agentic_start_folder_dev_refactor_TS
branch: dev_refactor_TS
output_artifacts:
  primary:
    plan: 260531_1038_py-retirement-bootstrap-cleanup_plan_01
    task: 260531_1038_py-retirement-bootstrap-cleanup_task_01
    report: 260531_1038_py-retirement-bootstrap-cleanup_report_01
  sidecars:
    brainstorm: null
    research: null
    explorer_check: null
    postmortem: null
  sidecar_justification:
    brainstorm: not_required
    research: not_required
    explorer_check: not_required
    postmortem: not_required
---

# Plan: py-retirement-bootstrap-cleanup

## Purpose / Big Picture

Retire the remaining Python/UV scaffold dependency from the factory/public
execution path without breaking safe adoption of older downstream repos.

Observable outcome:

- `afol bootstrap`/`afol update` can detect legacy scaffold-owned Python payloads
  in an adopted repo and, with an explicit cleanup flag, remove only safe
  scaffold-owned paths.
- The Bun/TypeScript CLI no longer depends on `./.agents/agents` for public
  command routing needed by this cleanup path.
- Repo docs and gates stop treating Python/UV as an expected compatibility
  layer once the code supports that claim.

## Progress

- [x] 2026-05-31 10:38 - Governed session created for Python retirement cleanup.
- [x] 2026-05-31 10:42 - Orchestration plan/task/report seeded.
- [x] Delegated Spark agents execute implementation slices.
- [x] Orchestrator runs integration validation.
- [ ] Orchestrator records evidence and reruns strict workbench checks.

## Surprises & Discoveries

- Observation: `./a new --help` currently creates a real `help` session instead
  of printing command help.
  Evidence: command created `260531_0937_help`.
- Observation: `./a n ... --feature-id ... --parent-spec ...` rejected governed
  creation flags, so the legacy wrapper remains needed for fully governed
  session creation.
  Evidence: exit 2, "Unexpected new arguments".
- Observation: GitNexus affected-scope analysis sees the combined dirty
  worktree as critical.
  Evidence: `npx gitnexus detect-changes --repo agentic-standard-folder` -> 27
  files, 121 symbols, 28 flows, risk critical.

## Decision Log

- Decision: Split execution into three disjoint delegated slices: bootstrap
  cleanup, CLI/native routing, and docs/gates/verification.
  Rationale: write scopes can be isolated and verified independently.
  Date/Author: 2026-05-31 / orchestrator
- Decision: Use `gpt-5.3-codex-spark` via default subagents as requested.
  Rationale: the configured `default` subagent is Spark-backed.
  Date/Author: 2026-05-31 / orchestrator

## Outcomes & Retrospective

- Outcome: Delegated implementation landed and TS validation passed.
- Remaining: Evidence closure and strict task verification.
- Lesson: The current TS `new` command is not yet parity-complete for governed
  creation flags.

## Governance Context

- Roadmap feature: `F-00`
- Parent spec: `260521_0000_total-reformulation-strategy_spec_01`
- Child spec: ``
- Planning rule:
  - This plan describes direct execution, not meta-planning or generic research.

## Planning Inputs

- Task artifact: `260531_1038_py-retirement-bootstrap-cleanup_task_01`
- Report artifact: `260531_1038_py-retirement-bootstrap-cleanup_report_01`
- Knowledge lookup performed:
  - `find src/project-template -maxdepth 3 -type f`: template contains wrappers
    and state/docs only, not a bootstrap implementation.
  - `sed cli/commands/bootstrap.ts cli/services/bootstrap/planner.ts`: bootstrap
    applies generated template files and filters forbidden paths, but does not
    scan/remove legacy payloads from target repos.
  - `find .agents/scripts .agents/runtime ... '*.py'`: root factory still has
    Python compatibility surfaces.

## Context and Orientation

- `src/project-template/` is the downstream payload. It intentionally contains
  `a`/`afol` wrappers and state/docs, not the bootstrap engine.
- `cli/commands/bootstrap.ts` owns current TS bootstrap apply behavior.
- `cli/services/bootstrap/planner.ts` plans create/update/conflict operations
  for files present in `DEFAULT_TEMPLATE_FILES`.
- `cli/schemas/template-policy.ts` defines forbidden template paths and removed
  runtime references.
- `cli/main.ts` still falls back to `runLegacyAdapter()` for delegate commands.
- Root `.agents/scripts/**` and `.agents/runtime/**` are Python/UV compatibility
  surfaces. This work should make their removal safe and verifiable.

## Scope

- In scope:
  - Detect legacy Python scaffold payloads in downstream targets.
  - Add explicit dry-run/apply cleanup planning for safe scaffold-owned removals.
  - Keep cleanup conservative: no deletion of project-owned or unknown-drift
    files without explicit force semantics.
  - Remove or narrow public CLI fallback to Python for affected command paths.
  - Update tests, docs, and repo gates proving Python is no longer expected in
    template/downstream cleanup flows.
- Out of scope:
  - Blind deletion of root factory `.agents/scripts/**` or `.agents/runtime/**`
    before replacement commands exist.
  - Rewriting every historical Python command in one patch.
  - Removing user/project-owned downstream files.
  - Changing unrelated active session `260531_1013_provider-neutral-lifecycle-specs`.

## Plan of Work

1. Bootstrap cleanup agent owns planner/apply behavior and fixtures.
2. CLI/native routing agent owns public command gaps that still require
   `./.agents/agents` for this workstream.
3. Docs/gates agent owns docs, policy checks, repo-wide no-Python guardrails, and
   final verification command inventory.
4. Orchestrator reviews returned patches, resolves conflicts, runs validation,
   records evidence, and closes tasks only after proof exists.

## Concrete Steps

1. Agent A: implement legacy cleanup detection/planning under
   `cli/services/bootstrap/**`, `cli/commands/bootstrap.ts`, and focused tests.
2. Agent B: implement native CLI support needed to avoid legacy `./.agents/agents`
   for governed creation/help paths touched by this work, in `cli/**` tests.
3. Agent C: update docs/spec/map wording and add/adjust checks that prove no
   Python/UV payload is exported or required for cleanup.
4. Orchestrator: run `bun run typecheck`, `bun test`, `bun run validate:template`,
   `bun run validate:bootstrap`, downstream smoke, and strict verification for
   this session.

## Interfaces and Dependencies

- Tools:
  - `bun`, `git`, `rg`, GitNexus after edits.
- MCPs:
  - N/A.
- Skills:
  - `agentic-orchestrator`, `agentic-folder-sys`, `code-discovery`.
- Files and interfaces that must exist at the end:
  - `cli/commands/bootstrap.ts`: cleanup flags are parsed and applied.
  - `cli/services/bootstrap/planner.ts` or sibling: cleanup plan is deterministic.
  - `cli/tests/*bootstrap*`: fixtures cover old Python scaffold removal.
  - `docs/map/README.md`, `AGENTS.md`, `CLAUDE.md` or relevant docs: runtime
    guidance matches code reality.

## Risks and Mitigations

- Risk: deleting user-owned downstream files -> Mitigation: cleanup only
  scaffold-owned paths by manifest/hash or explicit legacy allowlist, dry-run
  first, conflicts by default.
- Risk: claiming Python retirement while delegate commands still need Python ->
  Mitigation: keep docs precise and add a gate that reports remaining blockers.
- Risk: parallel agents touch same files -> Mitigation: disjoint write scopes;
  orchestrator integrates conflicts.

## Validation and Acceptance

- Unit: `bun test`
- E2E: `bun test cli/tests/downstream-smoke.test.ts`
- Typecheck: `bun run typecheck`
- Lint: `bun run validate:template && bun run validate:bootstrap`
- Behavioral acceptance:
  - Fixture with legacy `.agents/scripts`, `.agents/runtime`, `uv.lock`, and
    `pyproject.toml` reports cleanup in dry-run.
  - Apply mode removes only safe scaffold-owned legacy paths.
  - Clean template remains Python-free.
  - No public guidance tells users to run removed Python surfaces.

## Idempotence and Recovery

- Bootstrap dry-run is safe to re-run.
- Cleanup apply must be deterministic and should skip already-removed paths.
- Recovery is to restore from git for repo tests or from target repo backups for
  downstream cleanup fixtures.

## Artifacts and Notes

- Report artifact:
  `260531_1038_py-retirement-bootstrap-cleanup_report_01.md`.
- Accidental session from help probe:
  `.agents/wb/260531_0937_help/` remains untouched pending user cleanup decision.

## Completion Gate

- [x] Task exists and tracks the executable work
- [x] No step exists only to make another plan or do generic research
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [ ] Any optional artifact created for this workstream is `final`
- [ ] The ExecPlan remains self-contained enough for a new contributor to resume
- [ ] Progress entries reflect the actual current state
- [ ] Validation path is concrete enough to execute without guesswork
