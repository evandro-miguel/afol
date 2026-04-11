---
doc_type: spec
id: 260306_project-context-canon-and-setup_spec_01
status: active
owners:
- orchestrator
created_at: '2026-03-07T00:28:26Z'
updated_at: '2026-03-06T22:29:30-03:00'
roadmap_feature: F-08
spec_role: child
parent_spec: 260306_context-driven-execution-commands_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260306_2128_context-driven-execution-commands_plan_01
  task: 260306_2128_context-driven-execution-commands_task_01
  report: ''
scope:
  repo_areas:
  - docs/arc
  - .agents/wb
  packages:
  - agents-bootstrap
  - session context
risk_level: medium
---

# SPEC: project-context-canon-and-setup

## 1) Feature Intent

- Define where canonical project context lives and how setup/resume commands use it.
- Keep this context separate from runtime artifacts like tracks and avoid duplicating governance trees.

## 2) Problem

- Operators can infer context from many files, but not from a single canonical runtime contract.
- Some command flows currently assume context has already been manually prepared.

## 3) Users and User Journey

Primary users:

- Maintainers onboarding a repo into command-driven execution.
- Agents running status/implementation tasks.

User journey:

1. Run setup/resume path to establish canonical context references.
2. Use status/next-task flows that read project, workflow, and roadmap context.
3. Reuse existing workbench as execution evidence.

Failure or friction points:

- Missing context docs -> command should fail with precise resume guidance.
- Context drift between mirrors and `.agents` docs -> status reports canonical mismatch.

## 4) Experience and Behavior

- Expected behavior:
  - Canonical context reference points include project brief, product guidelines, workflow, and roadmap path.
  - Setup/resume command flow never creates a duplicate `conductor/` or equivalent governance tree.
  - Status exposes context readiness and missing prerequisites.
- Boundaries:
  - This spec does not define how every workflow detail is authored.

## 5) Scope

In scope:

- Context file naming and expected required minimum.
- Resume/setup success and failure states for missing prerequisites.
- Documented fallback behavior when mirrors diverge from canonical sources.

Out of scope:

- Changing the format of roadmap/spec/task runtime data.
- Hardcoding project-specific workflow semantics per repository.

## 6) Child Spec Strategy

- Child specs required: no

## 7) Constraints and Assumptions

- Assumptions:
  - `docs/arc` and `.agents/wb` remain canonical.
- Constraints:
  - Runtime adapters remain thin and should render these definitions without extending semantics.

## 8) Acceptance

- Success looks like:
  - Operators can answer "is context ready?" from a single command output.
  - Setup/resume no longer requires manual file discovery.

## 9) Risks and Tradeoffs

- Risk: too much required context blocks bootstrap speed -> Mitigation: clearly define required vs optional set.
- Tradeoff: one canonical path model reduces flexibility -> Why accepted: prevents drift and silent misrouting.

## 10) Rollout and Lifecycle

- Rollout approach:
  - Define minimum required context set.
  - Add status output for readiness before implementation starts.

## 11) Verification Philosophy

- Evidence expected from delivery:
  - Manual and scripted checks showing missing prerequisites are reported and required context can be resolved.

## 12) Acceptance Checklist

- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail
