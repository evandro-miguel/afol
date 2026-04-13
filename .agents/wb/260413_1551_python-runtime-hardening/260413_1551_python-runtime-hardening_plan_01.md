---
doc_type: plan
id: 260413_1551_python-runtime-hardening_plan_01
theme: python-runtime-hardening
status: active
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Define the concrete execution path for work that will actually be
  performed.
created_at: 2026-04-13 15:51:40-03:00
updated_at: '2026-04-13T15:56:07-03:00'
roadmap_feature: F-16
parent_spec: 260413_1250_project-template-source-separation_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  brainstorm: 260413_1551_python-runtime-hardening_brainstorm_01
  explorer_check: 260413_1551_python-runtime-hardening_explorer-check_01
  research: 260413_1551_python-runtime-hardening_research_01
  task: 260413_1551_python-runtime-hardening_task_01
repo: agentic_start_folder
branch: main
---

# Plan: python-runtime-hardening

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture

- Harden `.agents/scripts/` and `.agents/runtime/` after the template/source
  separation pass by making subprocess handling, MCP boundaries, and script
  contracts fail fast and stay testable.
- Keep the follow-up bounded: close the concrete runtime/script quality gaps
  now, and defer broader refactors until they have parity tests or measured
  evidence.

## Progress

- [x] 2026-04-13T15:51-03:00 - Scoped the follow-up to subprocess policy,
  runtime/MCP validation, contract/type hygiene, Ruff import cleanup, and
  measured performance-only tweaks.

## Surprises & Discoveries

- Observation: `uv run --project .agents/scripts --locked ruff check --select
  F,I .agents/scripts` currently reports 29 fixable issues.
  Evidence: import-order drift across scripts/tests plus two unused imports:
  `.agents/scripts/agents-knowledge.py:8` `sys` and
  `.agents/scripts/agents-new.py:25` `yaml`.
- Observation: `subprocess.run()` usage is scattered across scripts/runtime
  without one consistent timeout/error policy.
  Evidence: call sites include
  `.agents/runtime/src/agentic_scaffold/registry.py:104`,
  `.agents/runtime/src/agentic_scaffold/services/changes.py:82`,
  `.agents/scripts/agents-skills-sync.py:80`,
  `.agents/scripts/agents-repo-map.py:362`,
  `.agents/scripts/agents-review.py:42`,
  `.agents/scripts/agents-session.py:40`,
  `.agents/scripts/lib/execution_commands.py:403`, and
  `.agents/scripts/agents-bootstrap.py:1084`.
- Observation: two suspected bugs are not part of this pass.
  Evidence: `search.py` already reads text with `errors="ignore"` and guards
  non-dict frontmatter; the alleged duplicate branch/duplicate raise in
  `agents-wb-update.py` is not present in current code.

## Decision Log

- Decision: keep this as a bounded hardening follow-up, separate from the
  already-executed template/source-separation work.
  Rationale: the separation pass established the boundary; this session should
  only close the runtime and script quality gaps it exposed.
  Date/Author: 2026-04-13 / Codex
- Decision: defer larger refactors unless a slice includes parity coverage.
  Rationale: `agents-skills-sync.py` decomposition, broad search indexing
  cache work, and full MCP async/offload are higher-risk than the current
  cleanup set.
  Date/Author: 2026-04-13 / Codex

## Outcomes & Retrospective

- Outcome: the hardening scope is bounded and tied to concrete current
  defects.
- Remaining: implement the slices, add focused tests, and clear the lint/test
  gates.
- Lesson: keep performance work evidence-driven and leave broad rewrites
  behind parity tests.

## Governance Context

- Roadmap feature: `F-16`
- Parent spec: `260413_1250_project-template-source-separation_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs

- Brainstorm artifact: `260413_1551_python-runtime-hardening_brainstorm_01`
- Explorer check artifact: `260413_1551_python-runtime-hardening_explorer-check_01`
- Research artifact: `260413_1551_python-runtime-hardening_research_01`
- Knowledge lookup performed:
  - Reviewed the current plan template and nearby workbench plans.
  - Used the provided evidence from `ruff`, `rg`, and `./.agents/agents doctor`
    to bound the follow-up.
  - Aligned the scope to the project-local skills:
    `python-testing-patterns`, `python-type-safety`,
    `python-performance-optimization`, `python-resource-management`,
    `async-python-patterns`, `python-design-patterns`, `python-code-style`,
    and `python-mcp-server-generator`.

## Context and Orientation

- `.agents/scripts/` holds the CLI entrypoints and helper libraries that wrap
  repo automation.
- `.agents/runtime/` holds the runtime/MCP-facing Python package used by the
  script and adapter surfaces.
- This follow-up is not new feature work; it is the final runtime/script
  hardening pass after the template separation work already landed.
- The current evidence shows three classes of risk: subprocess policy drift,
  boundary validation gaps, and contract/type looseness in script helpers.

## Scope

- In scope:
  - subprocess timeout and diagnostics policy for runtime/scripts
  - runtime/MCP boundary hardening
  - contract/type hygiene in scripts
  - Ruff `I` cleanup and unused import removal
  - measured performance tweaks only
- Out of scope:
  - the already-completed template/source-separation work
  - broad rewrites or speculative caching
  - performance changes without a benchmark/profile signal
  - roadmap/spec edits and broad docs

## Plan of Work

- Start with the highest-risk subprocess and MCP boundary call sites, then add
  focused tests that prove timeout and failure behavior before expanding the
  slice.
- Tighten script contract helpers and YAML/frontmatter parsing only where the
  current evidence shows a real defect or hard failure risk.
- Run import-order cleanup as a mechanical slice after the behavioral tests are
  in place.
- Only measure and land performance changes if a benchmark or profile justifies
  them.
- Leave larger refactors as future work unless they can be paired with parity
  tests in the same slice.

## Concrete Steps

1. Reconfirm the current failure surface with focused `rg` and pytest targets in
   `.agents/scripts/tests` and `.agents/runtime/tests`.
2. Implement one hardening slice at a time:
   - subprocess helper/timeouts plus diagnostics
   - runtime/MCP validation
   - type/contract guards
   - Ruff import cleanup
3. Add or adjust focused tests before each slice expands to neighboring call
   sites.
4. Run the slice-level test and lint commands, then the repo-wide gates.

## Interfaces and Dependencies

- Tools:
  - `uv`
  - `pytest`
  - `ruff`
  - `rg`
  - `make`
- MCPs:
  - `repo-analysis`
  - `code-index` if symbol-level truth is needed for a call site
- Skills:
  - `python-testing-patterns`
  - `python-type-safety`
  - `python-performance-optimization`
  - `python-resource-management`
  - `async-python-patterns`
  - `python-design-patterns`
  - `python-code-style`
  - `python-mcp-server-generator`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/`
  - `.agents/runtime/`
  - the touched call sites and their tests

## Risks and Mitigations

- Risk: subprocess policy changes cause command regressions -> Mitigation: add
  explicit timeout and failure tests for each touched command path.
- Risk: runtime boundary checks reject valid inputs -> Mitigation: add
  malformed-input tests and preserve current good-path fixtures.
- Risk: import cleanup grows into a noisy rewrite -> Mitigation: keep Ruff `I`
  changes mechanical and limited to the touched package slice.
- Risk: performance work becomes speculative -> Mitigation: require measured
  evidence before changing generator or search behavior.

## Validation and Acceptance

- Unit: slice-specific pytest targets in `.agents/scripts/tests` and
  `.agents/runtime/tests`, then:
  - `uv run --project .agents/scripts --locked pytest .agents/scripts/tests -q`
  - `uv run --project .agents/runtime --locked pytest .agents/runtime/tests -q`
- E2E: `./.agents/agents mcp validate`
- Typecheck: N/A for this pass
- Lint:
  - `uv run --project .agents/scripts --locked ruff check --select F,I .agents/scripts`
  - `uv run --project .agents/runtime --locked ruff check .agents/runtime`
  - `make lint`
- Behavioral acceptance:
  - subprocess failures and timeouts are deterministic and reported with
    actionable diagnostics
  - malformed runtime/MCP inputs fail fast with clear validation errors
  - script contracts reject the wrong types instead of drifting into runtime
    exceptions
  - `make lint` passes after the slice work is complete

## Idempotence and Recovery

- The focused tests and lint commands are safe to rerun.
- If a slice regresses, back up to the last passing test boundary and keep the
  fix local to the touched helper or call site.
- Do not expand scope to the deferred refactors unless the current slice has
  parity coverage.

## Artifacts and Notes

- Local evidence already gathered:
  - `uv run --project .agents/scripts --locked ruff check --select F,I .agents/scripts`
  - `rg -n "subprocess\\.run\\(" .agents/scripts .agents/runtime/src --glob '*.py'`
  - `./.agents/agents doctor`
- False positives excluded:
  - `search.py` current frontmatter/text handling
  - alleged duplicate branch / duplicate raise in `agents-wb-update.py`
- No brainstorm or explorer-check artifacts are created for this initial plan.

## Completion Gate

- [ ] Brainstorm exists and reflects real option analysis
- [ ] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to
  resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---

*Template: `docs/templates/plan.md`*
