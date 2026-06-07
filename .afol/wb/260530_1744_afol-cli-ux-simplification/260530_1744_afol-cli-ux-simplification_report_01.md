---
doc_type: report
id: 260530_1744_afol-cli-ux-simplification_report_01
theme: afol-cli-ux-simplification
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Summarize delivered CLI front-door changes and validation.
created_at: 2026-05-30 18:08:40-03:00
updated_at: '2026-05-30T18:11:07-03:00'
roadmap_feature: F-03
parent_spec: 260521_0030_agent-command-design-system_spec_01
child_spec: null
related_tasks:
- T-01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260530_1744_afol-cli-ux-simplification_plan_01
  task: 260530_1744_afol-cli-ux-simplification_task_01
  postmortem: null
output_artifacts:
  primary:
    report: 260530_1744_afol-cli-ux-simplification_report_01
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

# Report: afol-cli-ux-simplification

## Governance Context

- Roadmap feature: `F-03`
- Parent spec: `260521_0030_agent-command-design-system_spec_01`
- Child spec: ``

## Summary

- `afol` is now the canonical CLI front door for the scaffold, with `./a`
  preserved as a compatibility alias.
- The root repo, project template, bootstrap copier, CLI help, docs, and tests
  now use `afol` as the primary command.

## Delivered Changes

- Added executable `afol` launchers in the root and project template.
- Simplified `a` wrappers so they delegate to `afol`.
- Updated `cli/main.ts` to advertise `afol`, route `check`, and normalize
  `start`, `done --test`, and `close` onto existing governed commands.
- Added `afol` to bootstrap mandatory copy and reconcile scope.
- Updated onboarding, roadmap, parent specs, spec tests, and bootstrap docs to
  make `afol` canonical while documenting `./a` as compatibility.
- Added a `package.json` `bin` entry for `afol`.

## Files Changed

- `afol`
- `a`
- `src/project-template/afol`
- `src/project-template/a`
- `cli/main.ts`
- `cli/tests/kernel.test.ts`
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/tests/test_front_door_a.py`
- `.agents/scripts/tests/test_agents_bootstrap.py`
- `.agents/scripts/tests/test_runtime_compatibility.py`
- `README.md`
- `docs/agentic/agents-bootstrap.md`
- `docs/arc/GENERAL-ROADMAP.md`
- `docs/arc/260521_total-reformulation-execution-plan.md`
- `docs/arc/SPECS/260521_0010_universal-agent-cli_spec_01.md`
- `docs/arc/SPECS/260521_0030_agent-command-design-system_spec_01.md`
- `docs/arc/SPECS/F-01/spec-tests/260521_0130_universal-agent-cli-kernel-contract_spec-test_01.md`
- `docs/arc/SPECS/F-03/spec-tests/260521_0135_agent-command-design-system_spec-test_01.md`
- `docs/standards/bootstrap-other-repo.md`
- `src/project-template/docs/standards/bootstrap-other-repo.md`
- `package.json`

## Optional Artifacts

- Brainstorm: `` -> `not created`
- Research: `` -> `not created`
- Explorer check: `` -> `not created`
- Postmortem: `` -> `not created`

## Verification

- `bun test cli/tests/kernel.test.ts` -> pass -> `9 pass, 0 fail`
- `bun run typecheck` -> pass -> `tsc --noEmit -p tsconfig.json`
- `PYTHONPATH=.agents/scripts python3 .agents/scripts/tests/test_front_door_a.py` -> pass -> `Ran 11 tests ... OK`
- `PYTHONPATH=.agents/scripts python3 -m unittest discover -s .agents/scripts/tests -p 'test_agents_bootstrap.py'` -> pass -> `Ran 31 tests ... OK`
- `PYTHONPATH=.agents/scripts python3 .agents/scripts/tests/test_runtime_compatibility.py RuntimeCompatibilityTests.test_bootstrap_mandatory_files_use_minimal_root_runtime_docs RuntimeCompatibilityTests.test_public_onboarding_docs_include_full_and_partial_paths` -> pass -> `Ran 2 tests ... OK`
- `bun test` -> pass -> `27 pass, 0 fail`
- `just lint` -> pass -> `Files checked: 183; Issues found: 0`
- `just lint-scripts` -> pass -> `All checks passed`
- `git diff --check` -> pass -> no output
- `./afol status --json`, `PATH="$PWD:$PATH" afol -h`, and `./a -h` -> pass
- `just validate-strict` -> pass -> full scaffold validation, 669 script tests,
  89 runtime tests, and active-session strict verification passed

## Risks / Follow-ups

- Full `test_runtime_compatibility.py` has two unrelated environment errors
  when `PyYAML` is unavailable; the tests changed by this slice were run
  directly and passed.
- A future public distribution slice should decide whether to publish an
  installable package or create a managed user-level PATH shim.

## Output Artifacts (file-first)

- Primary artifact: `report`
- Sidecars:
  - brainstorm: ``
  - research: ``
  - explorer_check: ``
  - postmortem: ``
- Sidecar justification:
  - `brainstorm`: `not_required`
  - `research`: `not_required`
  - `explorer_check`: `not_required`
  - `postmortem`: `not_required`

## Postmortem Link

- Postmortem: `` if created

## Lessons (if any)

- CLI ergonomics need explicit product-command validation; a short local script
  name can still feel wrong as a reusable CLI surface.

---

*Template: `docs/templates/report.md`*
