---
doc_type: postmortem
id: 260402_1613_scaffold-ops-skill_postmortem_01
theme: scaffold-ops-skill
status: final
owners:
- orchestrator
created_at: '2026-04-02T16:13:52-03:00'
updated_at: '2026-04-02T16:49:35-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1613_scaffold-ops-skill_plan_01
  task: 260402_1613_scaffold-ops-skill_task_01
  report: 260402_1613_scaffold-ops-skill_report_01
---

# Postmortem: scaffold-ops-skill

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- Make this scaffold easier for agents to install and operate through a local
  skill while keeping the system self-contained, git-manageable, and fully
  validated.

## What Was Achieved
- Canonicalized `agentic-system-workflow` as the scaffold-operating skill.
- Fixed `skills-sync` discovery, ensure fallback, default manifest semantics,
  local source validation, and local metadata generation.
- Reseeded the committed local source so it is internally consistent.
- Made full bootstrap create a missing target directory.
- Passed focused tests, local skill guards, and the full repository gate.

## What Did Not Land
- No dedicated `init-project` or `upgrade-framework` wrapper command was added.

## Problems Encountered
- Hardening source validation exposed tests and seeded state that had been
  relying on weak or inconsistent local-source assumptions.

## Root Causes
- The local source seed had been treated like a copied mirror, but it actually
  behaves as a curated subset and needs its own metadata contract.

## Useful Discoveries
- Using the git mirror for catalog/discovery while keeping install/apply
  local-first is the cleanest split for this scaffold.
- `default_skills` must coexist with `default_profile`; otherwise important
  scaffold-operating skills silently disappear from fresh installs.

## Follow-ups for Next Rounds
- Consider adding `init-project` / `upgrade-framework` as a thinner UX layer on
  top of the now-correct runtime.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `.agents/a-docs/templates/postmortem.md`*
