---
doc_type: research
id: 260402_1320_repo-sandbox-integrity_research_01
theme: repo-sandbox-integrity
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1320_repo-sandbox-integrity_plan_01
created_at: '2026-04-02T13:20:08-03:00'
updated_at: '2026-04-02T13:20:08-03:00'
---

# Research: repo-sandbox-integrity

## Questions
- What repo-local guarantees already exist for wrapper hermeticity, bootstrap generic export, partial install, and universal-skills integration?
- Which remaining gaps still stop the scaffold from behaving like a sealed downstream-ready sandbox after installation?
- What is the narrowest governing path that avoids redefining feature philosophy while still capturing the user requirement?

## Findings
- The repository already established a local-first wrapper contract in `260323_1305_wrapper-runtime-isolation-hardening`, but that guarantee did not extend to the full validation stack.
- Bootstrap generic export and partial install were already hardened under `F-04`, so the remaining problem is less about copying the scaffold and more about the runtime contract that the target repo receives.
- `F-10` remains the closest open feature because it explicitly owns reproducible skills/bootstrap/runtime adoption, but the requested work also depends on `F-06` runtime-compatibility rules and `F-11` documentation boundaries.
- The strongest remaining gaps are validation truthfulness, integration isolation, and skills/bootstrap inputs that are still preferred from outside the target repo.

## Sources
- `.agents/arc/GENERAL-ROADMAP.md` | credibility: high | notes: defines current feature status, exit criteria, and remaining open work for F-10/F-11.
- `.agents/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md` | credibility: high | notes: closest governing spec for reproducible downstream runtime adoption.
- `.agents/wb/260323_1305_wrapper-runtime-isolation-hardening/260323_1305_wrapper-runtime-isolation-hardening_report_01.md` | credibility: high | notes: proves the wrapper itself was already hardened toward hermetic execution.
- `.agents/wb/260323_1407_bootstrap-generic-export/260323_1407_bootstrap-generic-export_report_01.md` | credibility: high | notes: shows bootstrap already exports a generic downstream baseline.
- `.agents/wb/260323_1507_bootstrap-partial-install/260323_1507_bootstrap-partial-install_report_01.md` | credibility: high | notes: captures safe adoption for existing repositories.
- `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_report_01.md` | credibility: high | notes: records manifest v2 and runtime/profile-aware skills integration.
- `.agents/wb/260323_1827_universal-skills-local-source-and-discovery/260323_1827_universal-skills-local-source-and-discovery_report_01.md` | credibility: high | notes: confirms the sibling source checkout contract and remaining layout assumptions.
- `.agents/scripts/agents-bootstrap.py` | credibility: high | notes: current bootstrap behavior, post-checks, and sibling source preparation.
- `.agents/scripts/agents-skills-sync.py` | credibility: high | notes: current source selection, clone behavior, and project install model.
- `.agents/a-docs/standards/Makefile` | credibility: high | notes: real validation semantics and command surface.
- `.agents/scripts/tests/integration/test_critical_workflows.py` | credibility: high | notes: current integration harness writes against canonical repo state.

## Decision Impact
- Use `F-10` with `260323_1704_universal-skills-runtime-integration_spec_01` as the governing feature/spec for this workbench session.
- Add a local `spec-lite` to capture the stricter repo-sandbox integrity contract without reopening product-level philosophy.
- Treat `F-06` and `F-11` as constraints and documentation dependencies inside the execution plan.

## Open Unknowns
- Whether the long-term solution should deprecate the sibling `../universal-skills` preference or keep it as an explicit installation-time optimization.
- Whether `make all` should become the strongest gate or whether the scaffold should introduce a second, slower hermetic verification target.
- Whether the scope still fits a single F-10 workstream after the contract audit is completed.

---
*Template: `.agents/a-docs/templates/research.md`*
