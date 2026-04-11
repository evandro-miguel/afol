---
doc_type: research
id: 260404_0927_artifact-utility-enforcement_research_01
theme: artifact-utility-enforcement
status: final
owners:
- researcher
workstream_intent: delivery
artifact_purpose: Capture repo-backed findings about over-creation, weak readiness,
  and missing utility checks.
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260404_0927_artifact-utility-enforcement_plan_01
created_at: '2026-04-04T09:27:02-03:00'
updated_at: '2026-04-04T10:07:35-03:00'
---

# Research: artifact-utility-enforcement

## Questions
- Where does the current scaffold still create artifacts as a fixed package?
- Where does readiness/strict verification still confuse existence with usefulness?

## Findings
- `agents-new.py` still filtered artifact creation only by phase and spec flags before this change.
- `workflow_artifact_states()` previously treated `exists + status != draft` as enough for `ready`.
- `verify-tasks.py` previously checked structure and linkage, but not whether artifact bodies were still placeholder-only.

## Sources
- `.agents/scripts/agents-new.py` | credibility: high | notes: creation entrypoint
- `.agents/scripts/lib/execution_commands.py` | credibility: high | notes: readiness and catchup logic
- `.agents/scripts/verify-tasks.py` | credibility: high | notes: strict verification behavior
- Agent analyses from the mini and spark passes in this session | credibility: medium | notes: converged problem framing

## Decision Impact
- The fix must be catalog + policy + semantic utility, not a manifest-only refinement.

## Open Unknowns
- Whether any wrappers or integration tests still hardcode the old package-default assumptions.

---
*Template: `docs/templates/research.md`*
