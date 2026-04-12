---
doc_type: spec
id: 260412_1110_spec-child-and-spec-test-governance_spec_01
theme: spec-child-and-spec-test-governance
status: draft
owners:
- orchestrator
created_at: '2026-04-12T11:10:00-03:00'
updated_at: '2026-04-12T11:14:56-03:00'
roadmap_feature: F-14
spec_role: parent
parent_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - docs/arc
  - docs/templates
  - docs/standards
  - .agents/wb
  - .agents/scripts
  - .agents/skills
  packages:
  - agentic-scaffold
risk_level: medium
---

# SPEC: spec-child-and-spec-test-governance

## 1) Feature Intent

- Outcome: the scaffold treats `spec-child` as the canonical future artifact for
  child/local feature refinement and introduces `spec-test` as the required
  strategy artifact for planned test journeys.
- Why now: the current `spec-lite` name suggests a lighter or less rigorous
  artifact, while the intended workflow is actually a bounded child spec tied
  to a parent feature. Test creation also needs an explicit pre-test strategy
  so agents do not jump from implementation directly into ad hoc checks.
- Roadmap feature: `F-14`
- Role of this spec: parent

## 2) Problem

- `spec-lite` is useful as a local refinement pattern, but the name makes the
  artifact sound optional or lower quality instead of child-scoped.
- Large and medium features may need multiple test strategies, especially when
  one feature has separate user journeys, CLI paths, browser flows, or
  regression risks.
- Agents can currently begin test work without first writing what the test is
  supposed to measure, which clicks or commands matter, what technology should
  be used, and what result should count as success.
- Without a durable test strategy artifact, expected behavior can drift between
  the parent spec, workbench tasks, automated tests, and final reports.

## 3) Users and User Journey

Primary users:

- operators reviewing agent-created plans and test evidence
- agents preparing to test a feature or regression
- maintainers evolving scaffold governance for downstream repositories

User journey:

1. A feature is added to the roadmap and linked to a parent spec.
2. If the feature needs local decomposition, the workstream creates one or more
   `spec-child` artifacts instead of new `spec-lite` artifacts.
3. Before test implementation or serious QA begins, the agent creates one or
   more `spec-test` artifacts for the feature.
4. Each `spec-test` records the journey to verify, the commands or click path
   to perform, the expected behavior, the target test technology, the evidence
   format, and the expected result.
5. As testing improves, the `spec-test` can be updated to sharpen coverage and
   checking strategy without turning into test code.
6. The final workbench report links to the relevant `spec-test` and records
   actual evidence against it.

Failure or friction points:

- Historical `spec-lite` files already exist -> keep them readable and treat
  `spec-lite` as a migration alias until compatibility is proven.
- `spec-test` becomes a dumping ground for test code -> keep it as strategy and
  expected behavior only.
- Test strategy scatters across workbench notes -> define a feature-level folder
  convention and let workbench sessions link to the durable artifact.

## 4) Experience and Behavior

- Expected behavior:
  - `spec-child` is the canonical future name for child/local feature specs.
  - `spec-test` is a strategy artifact, not executable test code.
  - A feature may have multiple `spec-test` artifacts when it has distinct
    journeys or verification concerns.
  - `spec-test` content can be revised as the expected checking strategy
    becomes clearer.
  - Workbench plans and test tasks should reference the relevant `spec-test`
    before creating or changing tests.
- `spec-test` should capture:
  - feature or parent spec link
  - covered user journey
  - exact commands, clicks, inputs, or navigation path to perform
  - expected behavior and visible result
  - performance, timing, accessibility, or reliability expectations when relevant
  - recommended technology such as unit test, integration test, Playwright,
    CLI fixture, snapshot, or manual exploratory pass
  - construction notes for how the future test should be written
  - evidence format expected in the workbench report
  - open risks and follow-up cases
- Boundary:
  - This feature defines future planning and governance. It does not implement
    the refactor in the current planning-only turn.

## 5) Scope

In scope for the future F-14 implementation:

- naming and metadata rules for `spec-child`
- `spec-test` philosophy, template, and expected sections
- docs and template updates that move new work away from `spec-lite`
- validation plan for test-focused workstreams to link a `spec-test`
- migration compatibility for historical `spec-lite` artifacts
- a durable feature-level folder convention for test strategy artifacts

Out of scope for this planning record:

- editing scripts, command behavior, or tests immediately
- renaming historical workbench files
- deleting `spec-lite` compatibility before migration evidence exists
- writing executable test code

## 6) Child Spec Strategy

- Child specs required: yes, for implementation slices that change command
  behavior, templates, or validation independently.
- Planned child specs:
  - `spec-child` naming and migration compatibility
  - `spec-test` template and feature-level folder convention
  - validation and workbench linking behavior for test-focused sessions

## 7) Constraints and Assumptions

- Assumptions:
  - Existing `spec-lite` docs and workbench artifacts must remain readable
    because they are historical evidence.
  - Test strategy should live in goal-state governance docs when it defines
    feature expectations.
  - Workbench sessions remain execution evidence and should link to durable
    feature strategy rather than becoming the only source of test intent.
- Constraints:
  - Repository artifacts are written in English by default.
  - Project-owned governance belongs under `docs/arc/`, not `.agents/`, unless
    the artifact is runtime state.
  - Validation must be introduced after templates and docs are usable.

## 8) Acceptance

- Success looks like:
  - The roadmap has a planned F-14 entry linked to this spec.
  - New governance docs define `spec-child` and `spec-test` without starting implementation.
  - A future implementation plan can enumerate exact doc, template, script, and
    validation changes without re-discovering the philosophy.
  - `spec-lite` migration is explicitly backwards compatible.
  - `spec-test` clearly records what a test must measure before agents create
    test code.
- Review questions:
  - Does the plan prevent agents from testing without an explicit strategy?
  - Is `spec-child` clearly a stronger child-spec artifact rather than a weaker
    "lite" artifact?
  - Can one feature support multiple test strategies without scattering them
    across session notes?
