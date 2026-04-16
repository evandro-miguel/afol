---
doc_type: spec-test
id: 260412_1130_spec-child-and-spec-test-governance_spec-test_01
theme: spec-child-and-spec-test-governance
status: active
owners:
- tester
created_at: '2026-04-12T11:40:00-03:00'
updated_at: '2026-04-12T11:34:49-03:00'
roadmap_feature: F-14
parent_spec: 260412_1110_spec-child-and-spec-test-governance_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  workbench_plan: 260412_1130_spec-child-and-spec-test-governance_plan_01
scope:
  repo_areas:
  - .agents/scripts
  - docs/templates
  - docs/arc/SPECS
  - docs/standards
  - .agents/skills
risk_level: medium
---

# SPEC TEST: spec-child-and-spec-test-governance

## 1) Test Intent

- Prove that `spec-child` is the new canonical child/local spec artifact.
- Prove that `spec-test` can be created and validated as a strategy artifact
  before test implementation.
- Prove that legacy `spec-lite` sessions remain readable.

## 2) Covered Journey

1. Operator creates a workstream for an existing roadmap feature.
2. Operator asks for a child-scoped spec with `--spec-child`.
3. The scaffold creates a `*_spec-child_01.md` artifact from the canonical
   template.
4. Operator asks for a test strategy artifact with `--with spec-test`.
5. The scaffold creates a `*_spec-test_01.md` artifact that describes test
   intent rather than executable code.
6. Existing sessions that only contain `*_spec-lite_01.md` still resolve when a
   command asks for generic `spec` context.

## 3) Commands And Actions

- Run focused artifact selection tests under `.agents/scripts/tests`.
- Run at least one safe workstream creation command in a temporary fixture or
  through tests that exercises `--spec-child`.
- Run at least one safe workstream creation command in a temporary fixture or
  through tests that exercises `--with spec-test`.
- Run compatibility tests proving `spec-lite` remains accepted.

## 4) Expected Results

- `spec-child` appears in artifact manifests, allowed doc types, and templates.
- `spec-test` appears in artifact manifests, allowed doc types, and templates.
- `--spec-child` selects `spec-child`.
- `--spec-lite` still selects the legacy artifact.
- `resolve_artifact(session, "spec")` can use `spec-child`, `spec`, or
  `spec-lite` in a safe compatibility order.
- Lint/doctor surfaces recognize `spec-child` and `spec-test`.

## 5) Recommended Technology

- Python unit tests for artifact manifest, CLI parsing, and artifact resolution.
- Existing scaffold commands for end-to-end workbench creation when safe.
- Markdown lint and strict task verification for documentation correctness.

## 6) Evidence Format

- Workbench evidence IDs from `./.agents/agents wb-update evidence`.
- Test command names and pass/fail summaries in the F-14 report.
- Final `just lint` and strict F-14 workbench verification output summaries.

## 7) Open Risks

- Direct CLI workstream creation can mutate `.agents/wb`; prefer temporary test
  fixtures when possible.
- Historical `spec-lite` references in lessons and archived workbench artifacts
  should stay unchanged unless a later migration explicitly scopes them.
