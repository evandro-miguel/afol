---
doc_type: spec
id: 260521_0050_smart-rules-and-skills-routing_spec_01
theme: smart-rules-and-skills-routing
status: final
owners:
- orchestrator
created_at: '2026-05-21T00:50:00+08:00'
updated_at: '2026-05-29T13:20:21-03:00'
roadmap_feature: F-05
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - .agents/rules
  - .agents/skills cli/rules cli/skills
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: smart-rules-and-skills-routing

## 1) Feature Intent

Route only relevant rules and skills to agents based on the work they are about
to perform.

## 2) Problem

Agents should not need to load every rule and skill or guess which rules apply.

## 3) Expected Behavior

The CLI resolves rule and skill context from files, surfaces, task type, command
type, session metadata, requested role, and feature/spec context.

## 4) Product Boundary

The universal CLI owns reusable behavior. The project-local template owns local
state, rules, skills, workbench artifacts, specs, evidence, logs, config, and
update metadata. Current Python/uv/Bash behavior remains compatibility contract
until Bun/TypeScript parity is proven by focused tests.

## 5) Scope

In scope: Rule metadata, skill metadata, surface detection, path routing, task
routing, compact output, delegation context.

Out of scope: Perfect semantic classification in MVP, loading all rules by
default, hidden global overrides.

## 6) Acceptance

Agents can ask which rules apply; receive only relevant rules by default;
routing decisions are explainable; project-local rules and skills remain
updateable.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?

## 8) Closure

- Accepted implementation evidence: `E-20260528100236370279`.
- Closeout session: `.agents/wb/260528_0956_f05-review-parity-strict/`.
- Strict verification: `./.agents/agents verify-tasks --strict .agents/wb/260528_0956_f05-review-parity-strict/` passed.
