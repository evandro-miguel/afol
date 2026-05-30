---
doc_type: plan
id: 260530_1744_afol-cli-ux-simplification_plan_01
theme: afol-cli-ux-simplification
status: final
owners:
- orchestrator
workstream_intent: planning
artifact_purpose: Define the concrete execution path for work that will actually be
  performed.
created_at: 2026-05-30 17:44:26-03:00
updated_at: '2026-05-30T18:09:49-03:00'
roadmap_feature: F-03
parent_spec: 260521_0030_agent-command-design-system_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  task: 260530_1744_afol-cli-ux-simplification_task_01
  brainstorm: null
  explorer_check: null
  research: null
  postmortem: null
repo: agentic_start_folder_dev_refactor_TS
branch: dev_refactor_TS
output_artifacts:
  primary:
    plan: 260530_1744_afol-cli-ux-simplification_plan_01
    task: 260530_1744_afol-cli-ux-simplification_task_01
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

# Plan: afol-cli-ux-simplification

## Output Artifacts (file-first)

- Primary artifact: `plan`
- Sidecars:
  - brainstorm: ``
  - research: ``
  - explorer_check: ``
  - postmortem: ``
- Sidecar justification:
  - Provide one value per optional artifact, or `not_required`.

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture

- Make the scaffold feel like a normal CLI product, not a hidden project script.
- Replace the user-facing `./a` command with the canonical command name
  `afol`.
- Preserve `./a` as a temporary compatibility wrapper while docs, tests,
  bootstrap, and downstream usage migrate to `afol`.
- Reduce high-frequency governed-work commands to short, predictable flows that
  agents can run without remembering long `.agents/agents ...` invocations.

## Execution Contract

- This plan is planning-only because the user explicitly requested a workbench
  plan before implementation.
- Future execution must create or target a delivery task before editing product
  files.
- The implementation must not remove `.agents/agents`; it remains the
  compatibility dispatcher and low-level escape hatch.
- The implementation must not require users to put `.` in `PATH`.
- `afol` must be callable as `afol`, not `./afol`, in the intended operator
  environment.

## Progress

- [x] 2026-05-30 17:44-03 - Created planning workbench session for the CLI UX
  simplification slice.
- [x] 2026-05-30 17:45-03 - Confirmed the governing feature is F-03 Agent
  Command Design System and reviewed the current `./a` front-door contract.
- [x] 2026-05-30 18:08-03 - Implemented `afol` root/template launchers,
  retained `./a` compatibility wrappers, updated CLI help/routes/docs, and ran
  focused plus broad validation gates.

## Surprises & Discoveries

- Observation: The roadmap and F-03 spec already require short predictable
  commands, but the accepted implementation used `./a` as the local front door.
  Evidence: `docs/arc/GENERAL-ROADMAP.md` says the MVP includes `./a`; the
  F-03 spec grammar is `./a <domain> <action> [target] [flags]`.
- Observation: `./a` works for agents but reads like a local script, not a
  product CLI.
  Evidence: user feedback requested `afol` explicitly because `./a` is strange
  as a CLI command.

## Decision Log

- Decision: Make `afol` the canonical human and agent command.
  Rationale: It is a real command name and can be documented, installed, and
  invoked consistently across projects without the visual oddity of `./a`.
  Date/Author: 2026-05-30 17:45-03 / orchestrator
- Decision: Keep `./a` temporarily as a compatibility alias.
  Rationale: Existing tests, docs, and workbench history reference `./a`; a
  compatibility window avoids breaking current projects while the public command
  migrates.
  Date/Author: 2026-05-30 17:45-03 / orchestrator
- Decision: Add a command installation/shim story as part of the slice.
  Rationale: A command named `afol` only works without `./` if there is a PATH
  entry, package binary, or managed shim.
  Date/Author: 2026-05-30 17:45-03 / orchestrator

## Outcomes & Retrospective

- Outcome: `afol` is now the canonical root and template front door, with
  `./a` retained as a compatibility alias.
- Outcome: `afol status`, `afol check`, `afol start`,
  `afol done --test "<command>"`, `afol close`, and
  `afol bootstrap <repo> --partial` are routed or documented against existing
  governed command paths.
- Remaining: A future public distribution slice can decide whether to publish a
  registry package or managed user-level PATH shim beyond the committed
  package `bin` entry and project wrapper.
- Lesson: A command can be technically short but still feel wrong as a product
  interface; command ergonomics need an explicit acceptance check.

## Governance Context

- Roadmap feature: `F-03`
- Parent spec: `260521_0030_agent-command-design-system_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - This plan must describe the direct execution path for the requested work, not pre-planning or generic research tasks.
  - Brainstorm, explorer-check, and research artifacts are optional sidecars only when they are the requested deliverable or the smallest blocking proof before safe execution.

## Planning Inputs

- Task artifact: `` (not created in this planning-only session)
- Brainstorm artifact: `` (optional)
- Explorer check artifact: `` (optional)
- Research artifact: `` (optional)
- Postmortem artifact: `` (optional)
- Knowledge lookup performed:
  - `rg -n 'CLI|front-door|front door|kernel|alias|bootstrap|afol|\\.\\/a|`a`|F-0[0-9]|F-1[0-9]' docs/arc/GENERAL-ROADMAP.md docs/arc/SPECS .agents/wb -g '*.md'`
  - `sed -n '1,220p' docs/arc/SPECS/260521_0030_agent-command-design-system_spec_01.md`
  - `./a --help`, `./a status --help`, and `./.agents/agents --help`

## Context and Orientation

- Current public-ish front door is `./a`, implemented by the root `a` wrapper
  and the Bun/TypeScript kernel under `cli/main.ts`.
- The low-level dispatcher remains `.agents/agents`; many commands still
  delegate there for compatibility.
- The downstream template mirrors the wrapper and managed hashes under
  `src/project-template/`.
- Bootstrap currently documents and validates `./a`, `./a status`, and
  `./a v`.
- The F-03 spec defines short-command grammar but currently names `./a` as the
  entrypoint. This slice revises that product-facing command to `afol`.

## Scope

- In scope:
  - Add a canonical `afol` command path for root and downstream template usage.
  - Preserve `./a` as a compatibility alias during migration.
  - Update command help, examples, bootstrap validation, docs, specs, template
    export, and managed hashes.
  - Add ergonomic shortcuts for the high-frequency workbench flow:
    `afol start`, `afol done --test <command>`, `afol close`, `afol check`,
    and `afol bootstrap <repo> --partial`.
  - Keep JSON and compact output parity for the migrated front door.
- Out of scope:
  - Removing `.agents/agents`.
  - Removing `./a` in the first implementation slice.
  - Rewriting all delegated Python commands in TypeScript.
  - Publishing a public package registry release unless explicitly requested.

## Plan of Work

- First, add the `afol` executable path and make it route through the same
  kernel as `a`. The root repo and `src/project-template/` must both gain the
  command surface, and the template manifest/lock must track managed hashes.
- Second, update the TypeScript command contract in `cli/main.ts` so help,
  examples, unknown-command hints, and status/JSON examples use `afol` as the
  primary command. Keep `a`/`./a` in compatibility examples only where needed.
- Third, add UX-level aliases for common governed work so users and agents do
  not need to remember `implement start`, `implement complete`, or
  `verify-tasks --strict` for routine flows.
- Fourth, update bootstrap/onboarding docs and tests so new projects validate
  `afol` as the primary CLI.
- Fifth, run focused CLI/bootstrap tests, typecheck, strict workbench checks,
  and the aggregate validation gate.

## Concrete Steps

1. Create an implementation task in this session or a dedicated delivery
   session before product edits.
2. Add a root `afol` launcher or managed shim that invokes the same
   Bun/TypeScript kernel as `a`.
3. Mirror `afol` into `src/project-template/` and update
   `src/project-template/.agents/manifest.json` plus
   `src/project-template/.agents/lock.json`.
4. Update `cli/main.ts` help and command hints so `afol` is canonical.
5. Update `docs/arc/GENERAL-ROADMAP.md`,
   `docs/arc/SPECS/260521_0010_universal-agent-cli_spec_01.md`,
   `docs/arc/SPECS/260521_0030_agent-command-design-system_spec_01.md`, and
   `docs/standards/bootstrap-other-repo.md` to use `afol`.
6. Add or update tests proving:
   - `afol --help` is compact.
   - `afol status` and `afol s` work.
   - `afol -j status` and `afol status -j` emit JSON.
   - `./a` still delegates as a compatibility alias.
   - bootstrap installs and validates `afol` in a target repo.
7. Add shortcut behavior or documented routes for:
   - `afol check` -> appropriate validation/status check.
   - `afol start` -> starts the next actionable task in the active session.
   - `afol done --test "<command>"` -> records evidence and marks the active
     task done.
   - `afol close` -> runs session close/strict verification.
   - `afol bootstrap <repo> --partial` -> partial install path.
8. Run focused tests:
   - `bun test cli/tests`
   - `.agents/scripts/.venv/bin/python -m pytest -q .agents/scripts/tests/test_front_door_a.py .agents/scripts/tests/test_runtime_compatibility.py`
9. Run broad gates:
   - `bun run typecheck`
   - `git diff --check`
   - `just validate-strict`

## Interfaces and Dependencies

- Tools:
  - `bun`
  - `./a`
  - `.agents/agents`
  - future `afol`
- MCPs:
  - N/A
- Skills:
  - `agentic-folder-sys`
  - `typescript-expert` if the implementation changes kernel behavior.
- Files and interfaces that must exist at the end:
  - `afol`
  - `src/project-template/afol`
  - `cli/main.ts`
  - `cli/tests/*`
  - `.agents/scripts/tests/test_front_door_a.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `src/project-template/.agents/manifest.json`
  - `src/project-template/.agents/lock.json`
  - `docs/standards/bootstrap-other-repo.md`

## Risks and Mitigations

- Risk: `afol` is not found unless installed on `PATH`. -> Mitigation: define
  the install/shim story explicitly and validate with `command -v afol` in the
  intended environment or with a controlled test PATH.
- Risk: changing the primary command breaks existing sessions and docs. ->
  Mitigation: keep `./a` as compatibility alias and update docs in one batch.
- Risk: shortcut commands hide evidence requirements. -> Mitigation:
  `afol done --test <command>` must record the real command/result/evidence id
  before marking a task done.
- Risk: docs say `afol` while bootstrap only installs `./a`. -> Mitigation:
  bootstrap tests must assert `afol` is present and callable in the target.

## Validation and Acceptance

- Unit: `bun test cli/tests`
- Unit: `.agents/scripts/.venv/bin/python -m pytest -q .agents/scripts/tests/test_front_door_a.py .agents/scripts/tests/test_runtime_compatibility.py`
- E2E: bootstrap a temporary repo and run `afol --help`, `afol status`,
  `afol s`, `afol -j status`, and `afol bootstrap --help`.
- Typecheck: `bun run typecheck`
- Lint: `just lint`
- Behavioral acceptance:
  - `afol --help` fits in the compact help contract and uses `afol` in examples.
  - `afol status` is the documented primary command.
  - `./a status` still works as a compatibility alias.
  - New bootstrap/onboarding docs do not present `./a` as the primary CLI.
  - Agents can perform the common lifecycle with:
    `afol start`, `afol done --test "<command>"`, and `afol close`.

## Idempotence and Recovery

- Adding `afol` to the root and template should be idempotent: rerunning
  bootstrap/update should not create duplicate launchers or conflicting docs.
- If PATH shim installation is included, it must be reversible and report the
  exact path it writes.
- If a command shortcut fails, it must leave workbench task state unchanged
  unless evidence was successfully written.
- If tests fail after docs update, keep `./a` compatibility and fix the command
  route before changing deprecation language.

## Artifacts and Notes

- Current `./a --help` already shows a compact command surface, but still uses
  `a` as the product command.
- F-03 currently says `./a <domain> <action> [target] [flags]`; this slice
  should revise the command grammar to `afol <domain> <action> [target] [flags]`.
- Candidate everyday commands:
  - `afol status`
  - `afol check`
  - `afol new <theme> -F F-03 -S <spec>`
  - `afol start`
  - `afol done --test "just test"`
  - `afol close`
  - `afol bootstrap ../target --partial`

## Completion Gate

- [x] Delivery task exists before implementation starts
- [x] No step exists only to make another plan or do generic research
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Optional artifacts are not required for this planning-only slice
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---

*Template: `docs/templates/plan.md`*
