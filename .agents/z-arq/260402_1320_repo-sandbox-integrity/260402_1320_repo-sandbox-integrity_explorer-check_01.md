---
doc_type: explorer-check
id: 260402_1320_repo-sandbox-integrity_explorer-check_01
theme: repo-sandbox-integrity
status: final
owners:
- explorer
created_at: '2026-04-02T13:20:08-03:00'
updated_at: '2026-04-02T13:20:08-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1320_repo-sandbox-integrity_brainstorm_01
  plan: 260402_1320_repo-sandbox-integrity_plan_01
---

# Explorer Check: repo-sandbox-integrity

## Goal
- Prove the hardening plan was grounded in the current repository and its existing workbench history instead of being inferred from generic sandbox ideals.

## Scope Reviewed
- Paths inspected:
  - `.agents/agents`
  - `.agents/agents.config`
  - `.agents/a-docs/standards/Makefile`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/README.md`
  - `.github/workflows/agents-scaffold-ci.yml`
  - `.agents/scripts/tests/integration/test_critical_workflows.py`
- Existing docs inspected:
  - `README.md`
  - `AGENTS.md`
  - `PLANS.md`
  - `.agents/a-docs/standards/bootstrap-other-repo.md`
  - `.agents/a-docs/knowledge/INDEX.md`
- Existing scripts/tools checked:
  - `.agents/agents new ...`
  - `.agents/agents bootstrap ...`
  - `.agents/agents skills-sync ...`
  - `make all`
  - `make test-scripts`

## Commands Used
```bash
sed -n '1,260p' PLANS.md
sed -n '1,240p' .agents/agents.config
sed -n '1,260p' .agents/scripts/agents-bootstrap.py
sed -n '520,760p' .agents/scripts/agents-skills-sync.py
sed -n '430,580p' .agents/a-docs/standards/Makefile
sed -n '1,140p' .agents/scripts/tests/integration/test_critical_workflows.py
sed -n '1,240p' .github/workflows/agents-scaffold-ci.yml
rg -n "bootstrap|runtime|skills|sandbox|hermetic|external|universal-skills" .agents/arc .agents/a-docs README.md AGENTS.md
```

## Findings
- The wrapper already prefers `.agents/scripts/.venv` and a repo-local UV cache, so the normal command path is more hermetic than the rest of the validation stack.
- `test-scripts` and `lint-scripts` still call `uv run` directly, so the validation path remains partially host-dependent even after local setup exists.
- `make all` claims full validation in docs and help text, but it currently excludes integration and E2E coverage through `test-scripts`.
- The critical integration test file still targets the canonical repository and real `.active_session`, which is unsafe as a downstream-harness model and weakens truthful isolation guarantees.
- Bootstrap and skills-sync still prefer a sibling `../universal-skills` checkout and only fall back to `.agents/cache/universal-skills`, which is acceptable as an installation input but not yet a fully sealed repo-local contract.
- The roadmap still marks `F-10` and `F-11` as planned even though multiple workbench reports claim meaningful delivery, so the governance surface has documentation drift.

## Contradictions or Drift Found
- Help/docs describe `make all` as a truthful full-validation command, but the actual gate omits integration and E2E coverage.
- Prior reports state bootstrap and skills integration slices are delivered, but roadmap status still leaves the owning features open without clarifying what remains.
- The repo promises local-first downstream behavior while the integration harness still mutates real workbench state.

## Impact on the Plan
- What changed in the plan because of exploration:
  - The plan must treat validation truthfulness and integration isolation as first-class scope, not as secondary cleanup.
  - The plan should include an explicit decision point about whether to strengthen `make all` or introduce a new stronger hermetic gate.
  - The plan should treat roadmap/report parity as part of the closure path, not only implementation.
- What remains uncertain:
  - Whether this stays a scoped F-10 execution slice or grows into a new roadmap feature after the contract audit.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none before execution planning starts

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
