---
doc_type: spec
id: 260521_0090_template-update-and-versioning_spec_01
theme: template-update-and-versioning
status: final
owners:
- orchestrator
created_at: '2026-05-21T01:30:00+08:00'
updated_at: '2026-05-28T21:37:14-03:00'
roadmap_feature: F-09
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
  plan: .agents/wb/260528_2137_f09-closeout/260528_2137_f09-closeout_plan_01.md
  task: .agents/wb/260528_2137_f09-closeout/260528_2137_f09-closeout_task_01.md
  report: .agents/wb/260528_2137_f09-closeout/260528_2137_f09-closeout_report_01.md
scope:
  repo_areas:
  - .agents/lock.json
  - .agents/manifest.json cli/update src/project-template
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: template-update-and-versioning

## 1) Feature Intent

Allow downstream projects to update their local agent governance system when the
universal system improves.

## 2) Problem

Templates become stale after they are copied, and copied implementation code
fragments maintenance.

## 3) Expected Behavior

Each project has .agents/lock.json and .agents/manifest.json. The CLI supports
update check, plan, and apply flows with conflict detection.

2026-05-31 DR addendum:

- Lock and manifest processing must classify files by ownership class:
  `managed`, `project-owned`, `generated`, `ignored`, `conflict`.
- Update/apply must use diff/jsdiff-style previews so project-owned files are never
  silently overwritten.
- Real writes in update/apply are gated by session/task context and manifest state.

## 4) Product Boundary

The universal CLI owns reusable behavior. The project-local template owns local
state, rules, skills, workbench artifacts, specs, evidence, logs, config, and
update metadata. Current Python/uv/Bash behavior remains compatibility contract
until Bun/TypeScript parity is proven by focused tests.

## 5) Scope

In scope: Lock file, manifest file, update check, update plan, conflict
detection, apply update, post-update validation.

Out of scope: Silent automatic updates by default, overwriting user edits
without confirmation, cloud update service in MVP, arbitrary app-code migration.

## 6) Acceptance

Project can check and preview updates; user edits are preserved or flagged;
managed files update safely; validation runs after update.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?

## 8) Closure

- Accepted implementation evidence:
  - `5a1811fe0a967fc8a89c2c78a2722d972e210700` - scaffold update ignores
    `.agents/source/**` seed content.
  - `6fc611a095cca821c9276aad5b29ecc1fbd3ea96` - template bootstrap installs
    lock and manifest.
- Closeout session: `.agents/wb/260528_2137_f09-closeout/`
- Status: final

## 9) Hermes Benchmark Decisions

- Pattern: update reports must expose ownership, provenance, and drift.
- Hermes source concept: mature install/update flows distinguish created,
  updated, skipped, preserved, and conflicted artifacts.
- Local decision: adapt as bootstrap/update audit output without adopting a
  vendor marketplace or lazy install flow.
- Acceptance criteria: bootstrap and update reports list
  create/update/skip/preserve/conflict decisions with ownership and provenance;
  conflicts fail before overwrite; local edits remain preserved or explicitly
  flagged.
- Non-goals: no silent automatic updates, no lazy dependency install, no
  gateway monorepo bootstrap.
