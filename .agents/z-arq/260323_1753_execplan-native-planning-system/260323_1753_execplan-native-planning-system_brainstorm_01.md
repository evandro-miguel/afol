---
doc_type: brainstorm
id: 260323_1753_execplan-native-planning-system_brainstorm_01
theme: execplan-native-planning-system
status: final
roadmap_feature: F-12
parent_spec: 260323_1815_execplan-native-planning-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1753_execplan-native-planning-system_plan_01
created_at: '2026-03-23T17:53:45-03:00'
updated_at: '2026-03-23T18:05:33-03:00'
---

# Brainstorm: execplan-native-planning-system

## Problem Statement
- The scaffold already has governed plan files, but they are still weaker than the ExecPlan pattern recommended for long-running Codex work.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/a-docs/templates/plan.md`
  - `.agents/scripts/verify-tasks.py`
  - `AGENTS.md`
  - `.agents/scripts/agents-bootstrap.py`
- Existing patterns or constraints to confirm:
  - workbench plans must remain inside roadmap/spec/workbench governance

## Assumptions
- The right adaptation is to strengthen the existing workbench plan file, not replace it with a second root-only planning system.
- Strict verification is the correct enforcement layer for final-plan quality gates.

## Options
1. Option A - copy the cookbook structure literally and move planning away from the workbench.
2. Option B - keep workbench plans canonical, add a root `PLANS.md`, and upgrade template plus verifier.
3. Option C - update docs only and leave the verifier unchanged.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | closest to source material | breaks the scaffold's existing governance model | high | high |
| B | preserves governance and improves execution quality | touches template, verifier, bootstrap, and docs together | medium | medium |
| C | cheapest implementation | weak guardrail, plans still drift in practice | high | low |

## Preferred Direction
- Selected: Option B.
- Why: it upgrades the actual plan system instead of just its wording while keeping the scaffold's current governance model intact.
- Rejected options:
  - Option A -> creates an unnecessary second planning system.
  - Option C -> does not enforce the behavior the user asked for.

## Decision Criteria
- Preserve roadmap/spec/workbench governance.
- Make plan quality enforceable, not only documented.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - whether bootstrap currently exports a planning contract file
- Knowledge to reuse before planning:
  - `./.agents/agents knowledge pull "plan template exec plan"` returned no reusable knowledge, so direct repo inspection is required

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
