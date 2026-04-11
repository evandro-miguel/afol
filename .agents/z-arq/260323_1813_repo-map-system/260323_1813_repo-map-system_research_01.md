---
doc_type: research
id: 260323_1813_repo-map-system_research_01
theme: repo-map-system
status: final
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1813_repo-map-system_plan_01
created_at: '2026-03-23T18:13:06-03:00'
updated_at: '2026-03-23T18:30:47-03:00'
---

# Research: repo-map-system

## Questions
- What parts of OpenCode's `repo-organizer` are actually reusable in this scaffold?
- What is the exact external runner contract for a full repo map refresh?

## Findings
- `repo-organizer` is best understood as an artifact-first workflow contract, not as a prompt to copy wholesale. The reusable core is: generated codemap docs at `.agents/arc/map/`, raw evidence under `extra/`, and a deterministic runner.
- `~/apps/docker-analisys-tools/scripts/run-repo-map.sh` already performs the heavy pipeline and writes the expected `extra/` structure plus distilled root docs.
- The scaffold should wrap that runner behind a native command and document the separation between `structure-map` and `repo-map`.

## Sources
- `~/.config/opencode/agent/repo-organizer.md` | credibility: high | notes: defines the intended artifact contract and operator expectations
- `~/apps/docker-analisys-tools/scripts/run-repo-map.sh` | credibility: high | notes: real execution backend for the codemap pipeline
- `~/apps/docker-analisys-tools/README.md` | credibility: high | notes: explains output layout and operational guardrails

## Decision Impact
- Implement `repo-map` as a scaffold-native wrapper over the external runner, then generate a real map for this repository.

## Open Unknowns
- none blocking

---
*Template: `.agents/a-docs/templates/research.md`*
