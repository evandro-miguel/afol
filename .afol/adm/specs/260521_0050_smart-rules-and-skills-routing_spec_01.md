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
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - .afol/adm/rules
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
- Closeout session: `.afol/wb/260528_0956_f05-review-parity-strict/`.
- Strict verification: `./.agents/agents verify-tasks --strict .afol/wb/260528_0956_f05-review-parity-strict/` passed.

## 9) Architecture Delta: Skill Suggestion Routing

Follow-up delta captured on 2026-05-31: skill routing should support
suggestion candidates produced by memory, knowledge, and lifecycle events
without treating suggestions as installed skills.

Routing behavior:

- Installed skills continue to resolve from project-local and configured skill
  sources.
- Draft skill suggestions live under `.agents/tmp/skill-suggestions/` and are
  surfaced only when an operator asks for suggestions, reviews a candidate, or
  runs a materialization dry-run.
- Duplicate detection should compare suggested triggers, skill names, and
  source provenance against installed skills before proposing creation.
- Provider hooks may produce suggestion artifacts, but they must not directly
  change the routed skill set.

Pending follow-up:

- Add a suggestion-aware routing query that can explain why a candidate skill
  is not yet active.
- Add validation that generated skill suggestions do not shadow installed
  project-local or global skills without explicit operator approval.

## 10) Hermes Benchmark Decisions

- Pattern: explicit scan, install, and lock policy for skills.
- Hermes source concept: skills guard separates discovered capability material
  from installed, trusted runtime behavior.
- Local decision: adapt as a skill guard around scan/install/update paths;
  suggestions remain inactive until reviewed and locked.
- Acceptance criteria: skill scans report provenance; installs require an
  explicit source and lock update; generated suggestions cannot shadow active
  skills without operator approval.
- Non-goals: no lazy vendor marketplace install, no hidden global overrides, no
  activation of suggested skills by lifecycle hooks.
