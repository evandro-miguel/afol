---
doc_type: spec
id: 260323_1704_universal-skills-runtime-integration_spec_01
theme: universal-skills-runtime-integration
status: active
owners:
- orchestrator
created_at: '2026-03-23T17:04:00Z'
updated_at: '2026-03-23T17:25:44-03:00'
roadmap_feature: F-10
spec_role: parent
parent_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - .agents/scripts
  - .agents/skills
  - .agents/cache
  - docs
  - docs/arc
  packages:
  - skills-sync
  - bootstrap
  - runtime-adapters
risk_level: medium
---

# SPEC: universal-skills-runtime-integration

## 1) Feature Intent

- Outcome: the scaffold adopts a reproducible universal-skills integration model that is optimized for interactive CLI agent runtimes rather than ad-hoc local skill copying.
- Why now: the current `skills-sync` contract is useful but shallow; it cannot express pinned skill source refs, profiles, or richer runtime-target semantics that downstream repos now need.
- Roadmap feature: `F-10`
- Role of this spec: parent

## 2) Problem

- The scaffold currently tracks selected skills as a lightweight manifest, but that model is weaker than the upstream universal-skills contract.
- Downstream repos cannot yet express a deterministic repo/ref/profile install policy through the scaffold's native commands.
- Bootstrap prepares runtime adapters and docs well, but it does not yet prepare a first-class skills lock/install contract for interactive agent runtimes.

## 3) Users and User Journey

Primary users:

- project maintainers adopting the scaffold into a new or existing repo
- operators running interactive CLI agents against those repos

User journey:

1. A maintainer bootstraps the scaffold into a repo meant for Codex/OpenCode/Gemini/Claude-style agent execution.
2. The maintainer or agent installs the correct skill set through a pinned source/profile contract.
3. The repo validates that installed skills match the expected source and runtime target semantics.

Failure or friction points:

- Mutable branch-only skill sync causes drift -> the system should support a pinned source/ref contract.
- Projects do not know which skills belong locally vs upstream -> docs and tooling should make ownership explicit.

## 4) Experience and Behavior

- Expected behavior:
  - The scaffold can represent skills configuration as a reproducible contract, not only a mutable selected list.
  - Operators can install skills by profile or by explicit skill selection for supported interactive runtimes.
  - Bootstrap can prepare downstream repos with a valid skills baseline that does not require manual structure invention.
- Boundaries:
  - The scaffold should not become the source repository for universal-skills itself.
  - Runtime-specific skill adapters must stay thin and must not duplicate the scaffold governance tree.

## 5) Scope

In scope:

- lockfile/profile-aware skills contract for this scaffold
- skills-sync command surface evolution
- bootstrap integration for skills baseline creation
- validation, docs, and tests for the new behavior

Out of scope:

- replacing the upstream universal-skills repository
- implementing every upstream helper command on day one

## 6) Child Spec Strategy

- Child specs required: no
- Decomposition rule:
  - split into child specs if command-surface evolution, bootstrap integration, and runtime-target validation become independently large delivery tracks
- Planned child specs:
  - none yet

## 7) Constraints and Assumptions

- Assumptions:
  - The scaffold remains optimized for interactive CLI runtimes.
  - Existing downstream repos need a migration path from the current manifest.
- Constraints:
  - Compatibility: preserve current basic workflows while introducing the stronger contract
  - Operational: bootstrap must remain usable in isolated repos and on partial installs
  - Security/privacy: no runtime credentials or machine-local secrets may be baked into the skills contract

## 8) Acceptance

- Success looks like:
  - A maintainer can understand and use the universal-skills integration contract without reading upstream code first.
  - The scaffold can prove the installed skill set matches the declared contract for supported runtimes.
- Review questions:
  - Does this spec explain the feature without code?
  - Can an executor understand the user journey from this document alone?

## 9) Risks and Tradeoffs

- Risk: the feature overfits upstream universal-skills internals -> Mitigation: adopt only the contract pieces that improve scaffold reproducibility and runtime ergonomics.
- Tradeoff: stronger skills contracts increase setup surface area -> Why accepted: deterministic multi-runtime installs are worth the extra explicitness.

## 10) Rollout and Lifecycle

- Rollout approach:
  - start by defining the scaffold-local contract and a migration path from the existing manifest
  - then integrate bootstrap and validation
- Workstream linkage:
  - Execution must reference `roadmap_feature` and `parent_spec`
- Backout or deferral:
  - the scaffold can keep the current simple manifest path temporarily if migration takes longer than expected

## 11) Verification Philosophy

- Evidence expected from delivery:
  - script-level tests for skills contract handling
  - real bootstrap/install verification in fresh and partial target repos
- Open questions:
  - Q-01 Which subset of upstream lockfile policy should be adopted immediately?
  - Q-02 Which runtime targets should be required in the first validation pass?

## 12) Acceptance Checklist

- User journey is explicit.
- Scope and non-goals are explicit.
- Child-spec policy is defined.
- Constraints and risks are explicit.
- Feature intent is understandable without implementation detail.
