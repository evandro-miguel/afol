---
doc_type: spec
id: 260521_0000_total-reformulation-strategy_spec_01
theme: total-reformulation-strategy
status: draft
owners:
- orchestrator
created_at: '2026-05-21T00:00:00+08:00'
updated_at: '2026-05-21T00:00:00+08:00'
roadmap_feature: F-00
spec_role: parent
parent_spec:
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - docs/arc docs/arc/SPECS src/project-template
  - .agents
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: total-reformulation-strategy

## 1) Feature Intent

Create the strategic base for a total reformulation of the project.

## 2) Problem

The current system has strong governance concepts, but its long-term
architecture needs sharper separation between universal behavior and local
project state.

## 3) Expected Behavior

The project will be redesigned as universal CLI plus minimal local template. CLI
owns logic. Local project owns state. ./a is the default command entrypoint for
agents.

## 4) Product Boundary

The universal CLI owns reusable behavior. The project-local template owns local
state, rules, skills, workbench artifacts, specs, evidence, logs, config, and
update metadata. Current Python/uv/Bash behavior remains compatibility contract
until Bun/TypeScript parity is proven by focused tests.

## 5) Scope

In scope: Manifesto, roadmap, feature specs, product/factory boundary,
Bun/TypeScript-first architecture, universal CLI strategy, command grammar,
local state model, update strategy, validation strategy.

Out of scope: Full CLI implementation, migrating every legacy script
immediately, UI, cloud services, public release polish before MVP.

## 6) Acceptance

Manifesto and roadmap exist; every major feature has a parent spec; CLI/template
separation is explicit; low-token command model is explicit; Bun/TypeScript is
established as the future core.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?
