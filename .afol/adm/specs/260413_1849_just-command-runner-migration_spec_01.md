---
doc_type: spec
id: 260413_1849_just-command-runner-migration_spec_01
theme: just-command-runner-migration
status: final
owners:
- orchestrator
created_at: '2026-04-13T18:49:41-03:00'
updated_at: '2026-05-28T20:45:06-03:00'
roadmap_feature: F-17
spec_role: parent
parent_spec: ''
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: .afol/wb/260528_2043_f17-closeout/260528_2043_f17-closeout_plan_01.md
  task: .afol/wb/260528_2043_f17-closeout/260528_2043_f17-closeout_task_01.md
  report: .afol/wb/260528_2043_f17-closeout/260528_2043_f17-closeout_report_01.md
scope:
  repo_areas:
  - legacy just command runner
  - docs/standards
  - src/project-template
  - .agents/scripts
  - .agents/tools.json
  - .github/workflows
  - README.md
  packages:
  - agentic-scaffold
risk_level: high
---

# SPEC: just-command-runner-migration

> Superseded: this spec is historical. The current command direction is
> AFOL-only through `afol`; root/template Justfiles must not be generated or
> documented as public downstream entrypoints.

## 1) Feature Intent

- Outcome: `just` becomes the canonical command runner for scaffold operations
  while preserving the behavior users previously reached through Make targets.
- Why now: the repo uses Make mostly as a command wrapper, not as a build
  system, and `just` better matches that use case while already being installed
  locally.
- Roadmap feature: `F-17`
- Role of this spec: parent feature intent.

## 2) Problem

- The current command surface is centered on `legacy just command runner` and
  `docs/standards/legacy just command runner`, even though most targets delegate directly to
  `.agents/agents`, `uv`, or simple shell wrappers.
- Bootstrap, templates, CI, tool metadata, runtime mirrors, and docs all assume
  Make, so a direct replacement risks breaking downstream adoption and local
  validation behavior.

## 3) Users and User Journey

Primary users:

- Scaffold maintainers.
- Operators adopting this scaffold into downstream repositories.
- Interactive agent runtimes using the repo's canonical command references.

User journey:

1. A maintainer runs `just --list` or `just all` from the repo root.
2. The command resolves the same validation, bootstrap, workbench, telemetry,
   skills, and runtime workflows that Make exposed before migration.
3. CI, bootstrap, and generated project templates use the same Just-based
   command surface without requiring Make.

Failure or friction points:

- A legacy Make-only path remains in bootstrap or CI -> replace it with a Just
  path or keep a temporary compatibility bridge with explicit removal criteria.
- A parameterized target changes calling semantics unexpectedly -> validate
  both command behavior and documented examples before removing Make references.

## 4) Experience and Behavior

- Expected behavior:
  - `just all` runs the complete scaffold validation path and preserves the 80%
    scripts coverage gate.
  - Former Make targets such as `doctor`, `lint`, `test-scripts`, `wb-touch`,
    `skills-sync`, `telemetry-report`, and `patterns-*` have Just equivalents.
  - `src/project-template/` contains the downstream Just command surface.
  - CI uses Just once parity is proven.
- Boundaries:
  - Do not rewrite the `.agents/agents` runtime command architecture as part of
    this migration.
  - Do not remove compatibility files until direct consumers have been updated
    and tests prove the replacement path.

## 5) Scope

In scope:

- Add root and standards legacy just command runners for the scaffold command surface.
- Update bootstrap and project-template output to generate legacy just command runners.
- Update tests that assert legacy just command runner behavior to assert Just parity and the new
  compatibility contract.
- Update canonical docs, tool metadata, runtime mirrors, and CI to use Just.
- Clean Make-specific references from canonical command docs after Just parity
  is executable.

Out of scope:

- Replacing the `.agents/agents` CLI with Just recipes.
- Adding new product features unrelated to command-runner migration.
- Dropping coverage below the existing 80% scripts gate.

## 6) Child Spec Strategy

- Child specs required: yes.
- Decomposition rule:
  - Use child specs or workbench slices for command parity, bootstrap/template
    wiring, docs/catalog cleanup, and final Make compatibility removal.
- Planned child specs:
  - Command parity legacy just command runner slice.
  - Bootstrap and project-template legacy just command-runner wiring.
  - Documentation, tools catalog, CI, and runtime mirror cleanup.

## 7) Constraints and Assumptions

- Assumptions:
  - The local `just` version is 1.46.0 and should be treated as the minimum
    available feature set for this migration.
  - The migration should remain incremental and tested after each script or
    command-surface slice.
- Constraints:
  - Compatibility: former Make targets must either keep behavior through Just or
    receive an explicit replacement and documented migration note.
  - Operational: bootstrap and CI must not point to a command before that
    command has passing parity evidence.
  - Security/privacy: generated templates must not export local caches,
    workbench state, or secrets.

## 8) Acceptance

- Success looks like:
  - `just all` passes and enforces the 80% scripts coverage gate.
  - Focused bootstrap/template tests pass with Just-based command generation.
  - `rg` shows no canonical Make-only command references outside historical
    notes or intentionally documented compatibility.
  - Workbench report records every verification command and its result.
- Review questions:
  - Can a downstream adopter use the scaffold without knowing Make?
  - Does the repo still explain any remaining Make compatibility intentionally?

## 9) Risks and Tradeoffs

- Risk: parameterized Make targets translate poorly to Just -> Mitigation:
  preserve `NAME=value just recipe` compatibility in the first pass and migrate
  ergonomics only after parity is proven.
- Risk: shell state changes because Just linewise recipes run one command line
  at a time -> Mitigation: use shebang recipes or explicit shell blocks for
  complex targets.
- Risk: bootstrap or template tests miss a generated-file path -> Mitigation:
  update both live repo and `src/project-template` tests in the same slice.
- Tradeoff: keep a temporary Make compatibility bridge -> Why accepted:
  incremental verification is safer than a big-bang removal across CI,
  bootstrap, docs, templates, and runtime mirrors.

## 10) Rollout and Lifecycle

- Rollout approach:
  - Add Just parity first, switch automation second, clean Make references
    third, remove compatibility last.
- Workstream linkage:
  - Execution must reference `roadmap_feature: F-17` and
    `parent_spec: 260413_1849_just-command-runner-migration_spec_01`.
- Backout or deferral:
  - If a Just slice fails parity, keep the Make bridge for that slice and record
    the blocker in the workbench log before continuing elsewhere.

## 11) Verification Philosophy

- Evidence expected from delivery:
  - `just --list` and targeted Just recipe outputs for migrated commands.
  - `just all` with the scripts coverage gate at or above 80%.
  - Focused tests for bootstrap command generation, template parity, and tool
    catalog metadata.
- Open questions:
  - Q-01 Which compatibility Make references should remain as historical notes
    after the canonical docs move to Just?
  - Q-02 Should `just` remain as a thin adapter for one release cycle or be
    removed once CI and docs switch to Just?

## 12) Acceptance Checklist

- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail

---

*Spec: `docs/arc/SPECS/260413_1849_just-command-runner-migration_spec_01.md`*
