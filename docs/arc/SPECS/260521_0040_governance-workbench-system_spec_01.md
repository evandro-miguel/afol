---
doc_type: spec
id: 260521_0040_governance-workbench-system_spec_01
theme: governance-workbench-system
status: draft
owners:
- orchestrator
created_at: '2026-05-21T00:40:00+08:00'
updated_at: '2026-05-21T00:40:00+08:00'
roadmap_feature: F-04
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - .agents/wb src/project-template/.agents/wb cli/workbench
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: governance-workbench-system

## 1) Feature Intent

Create a command-managed workbench for plans, specs, tasks, logs, evidence,
reports, sidecars, and closure.

## 2) Problem

Agents lose state in chat and waste tokens opening files just to update routine
status.

## 3) Expected Behavior

Agents can create sessions, link specs, create plans/tasks, start tasks, append
logs, add evidence, mark done, save research sidecars, verify state, and close
sessions via commands.

## 4) Product Boundary

The universal CLI owns reusable behavior. The project-local template owns local
state, rules, skills, workbench artifacts, specs, evidence, logs, config, and
update metadata. Current Python/uv/Bash behavior remains compatibility contract
until Bun/TypeScript parity is proven by focused tests.

## 5) Scope

In scope: Session, task, evidence, log, sidecar, closure validation,
command-managed updates.

Out of scope: Replacing issue trackers, complex team permissions, always-on
orchestration.

## 6) Acceptance

Agents can update workbench state via commands; completed tasks require
evidence; logs and research can be saved without flooding chat; closure fails on
missing required state.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?
