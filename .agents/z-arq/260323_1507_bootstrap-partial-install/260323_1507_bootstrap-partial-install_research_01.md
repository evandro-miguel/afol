---
doc_type: research
id: 260323_1507_bootstrap-partial-install_research_01
theme: bootstrap-partial-install
status: draft
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1507_bootstrap-partial-install_plan_01
created_at: '2026-03-23T15:07:03-03:00'
updated_at: '2026-03-23T15:24:34-03:00'
---

# Research: bootstrap-partial-install

## Questions
- How should the installer behave when the target repo already contains project-owned files?
- Which warnings seen after bootstrap are legitimate governance signals versus installer-created noise?

## Findings
- Existing-project adoption needs an explicit operator signal. `--partial` makes the contract clear and testable.
- Synced skill docs are imported content and are already covered by `skills-check`; excluding them from markdown lint avoids false positives without weakening project-owned doc validation.
- A missing `.agents/wb/.active_session` is normal in a newly bootstrapped repo that has not started any workstream yet, so doctor should not warn in that state.
- Generated roadmap/spec starter IDs must align with the repository naming convention to avoid immediate post-install drift.

## Sources
- `.agents/scripts/agents-bootstrap.py` | credibility: high | notes: canonical bootstrap implementation and generated baseline source
- `.agents/scripts/agents-doctor.py` | credibility: high | notes: source of the active-session validation behavior
- `.agents/agents.config` | credibility: high | notes: lint exclusion contract for imported skill content
- `.agents/a-docs/standards/bootstrap-other-repo.md` | credibility: high | notes: canonical operational guidance for cross-repo installation

## Decision Impact
- Added explicit `--partial` CLI and `PARTIAL=1` Make entrypoint.
- Cleaned bootstrap-generated warnings instead of asking operators to ignore them.

## Open Unknowns
- None blocking implementation or release readiness.

---
*Template: `.agents/a-docs/templates/research.md`*
