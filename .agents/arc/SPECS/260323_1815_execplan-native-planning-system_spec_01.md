---
doc_type: spec
id: 260323_1815_execplan-native-planning-system_spec_01
theme: execplan-native-planning-system
status: draft
owners:
- orchestrator
created_at: '2026-03-23T18:15:00Z'
updated_at: '2026-03-23T18:05:33-03:00'
roadmap_feature: F-12
spec_role: parent
parent_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - .agents/a-docs/templates
  - .agents/a-docs/standards
  - .agents/scripts
  - AGENTS.md
  - README.md
  packages:
  - planning-system
  - verify-tasks
  - workflow-docs
risk_level: medium
---

# SPEC: execplan-native-planning-system

## 1) Feature Intent
- Outcome: major work in this scaffold is guided by a stronger ExecPlan-style planning contract that is living, self-contained, and executable by a novice contributor or stateless CLI agent.
- Why now: the current plan system has good governance links, but it does not yet force the level of self-containment, progress tracking, and decision capture recommended for longer-running Codex-style work.
- Roadmap feature: `F-12`
- Role of this spec: parent

## 2) Problem
- The existing `plan.md` template is useful but not strong enough as a standalone execution artifact for multi-hour tasks.
- The current strict verifier enforces governance gates, but it does not ensure that plans retain living sections such as progress, discoveries, decisions, and outcomes.
- Agents can still treat plans as static pre-implementation docs instead of the primary narrative of how the work will be carried out and updated.

## 3) Users and User Journey
Primary users:
- operators running interactive CLI agents in this scaffold
- maintainers reviewing governed workstreams after long-running execution

User journey:
1. An operator opens a non-trivial feature in the scaffold and creates a governed workstream.
2. The plan file acts as the execution contract: it explains context, concrete edits, commands, expected behavior, and progress as work proceeds.
3. A later contributor can restart from the plan plus working tree, understand what happened, and continue safely.

Failure or friction points:
- Plans that only describe governance context are not enough -> the system should require executable, novice-guiding content.
- Plans drift from reality during long sessions -> the system should require living progress, discoveries, decisions, and outcomes sections.

## 4) Experience and Behavior
- Expected behavior:
  - `AGENTS.md` tells operators when to use ExecPlans and where the canonical planning contract lives.
  - `PLANS.md` explains the ExecPlan rules in scaffold terms without breaking workbench governance.
  - Workbench plan files include the mandatory living-document sections needed for long-running Codex-style execution.
  - Strict verification fails if a finalized plan lacks required ExecPlan sections or a maintained progress checklist.
- Boundaries:
  - The scaffold should not abandon roadmap/spec/workbench governance in favor of a root-only planning system.
  - ExecPlan rules should be adapted to this scaffold rather than copied blindly from the cookbook.

## 5) Scope
In scope:
- canonical ExecPlan contract for this repo
- plan template upgrade
- AGENTS/README/workflow documentation updates
- verifier and tests for final-plan requirements

Out of scope:
- redesigning all workbench artifact types
- replacing specs or reports with a single-document workflow

## 6) Child Spec Strategy
- Child specs required: no
- Decomposition rule:
  - split only if the verifier/template/doc changes become independently large tracks
- Planned child specs:
  - none

## 7) Constraints and Assumptions
- Assumptions:
  - The scaffold remains optimized for interactive CLI agents such as Codex CLI, OpenCode, Gemini CLI, and Claude Code.
  - Long-running work benefits from a plan that is reusable as a restart artifact.
- Constraints:
  - Compatibility: keep current roadmap/spec/workbench linkage intact
  - Operational: do not require a second parallel planning tree outside governed workstreams
  - Security/privacy: plans must remain repo-local and secret-free

## 8) Acceptance
- Success looks like:
  - A contributor can read the plan file alone and understand what to change, where to change it, what to run, and what outcomes prove success.
  - Finalized plans fail verification unless they maintain the required living ExecPlan sections.
- Review questions:
  - Does the system now distinguish a static planning memo from a living ExecPlan?
  - Can a later contributor restart from the plan with minimal missing context?
