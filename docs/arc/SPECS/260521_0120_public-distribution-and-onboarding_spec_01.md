---
doc_type: spec
id: 260521_0120_public-distribution-and-onboarding_spec_01
theme: public-distribution-and-onboarding
status: final
owners:
- orchestrator
created_at: '2026-05-21T02:00:00+08:00'
updated_at: '2026-05-29T11:42:15-03:00'
roadmap_feature: F-12
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - README.md src/project-template docs package
  packages:
  - agentic-cli
risk_level: medium
---

# SPEC: public-distribution-and-onboarding

## 1) Feature Intent

Prepare the system for future public use without compromising the current
personal workflow.

## 2) Problem

A personal-only tool may contain private assumptions, unclear onboarding, long
internal context, or machine-specific workflows.

## 3) Expected Behavior

Future users can install the CLI, initialize a project, run ./a s, create
governed tasks, add evidence, close sessions, and update the local template
without reading long internal docs.

## 4) Product Boundary

The universal CLI owns reusable behavior. The project-local template owns local
state, rules, skills, workbench artifacts, specs, evidence, logs, config, and
update metadata. Current Python/uv/Bash behavior remains compatibility contract
until Bun/TypeScript parity is proven by focused tests.

## 5) Scope

In scope: Public README shape, install path, first-run experience, minimal
examples, public-safe assumptions, versioning model.

Out of scope: Hosted service, marketplace, large plugin ecosystem before core
stability, public launch before internal MVP works.

## 6) Acceptance

A new user can understand the tool quickly; first-run setup is simple; example
project works; private assumptions are removed; docs stay short and practical.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?

## 8) Closure

- Accepted implementation evidence: `E-20260528144544308053`.
- Closeout session: `.agents/wb/260528_1444_public-distribution-and-onboarding/`.
- Status: final
