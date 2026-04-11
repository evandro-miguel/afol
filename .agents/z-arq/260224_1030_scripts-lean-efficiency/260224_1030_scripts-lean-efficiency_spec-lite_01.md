---
doc_type: spec-lite
id: 260224_1030_scripts-lean-efficiency_spec-lite_01
theme: scripts-lean-efficiency
status: active
owners:
- orchestrator
created_at: '2026-02-24T10:30:20-03:00'
updated_at: '2026-02-24T14:30:52-03:00'
links:
  tasks: 260224_1030_scripts-lean-efficiency_task_01
risk_level: medium
---

# SPEC LITE: scripts-lean-efficiency

## Objective
- Reduce accidental complexity and maintenance overhead in `.agents/scripts` while preserving feature and command parity.

## Change Summary
- Execute phased refactor with explicit parity matrix checks.
- Consolidate overlapping command surfaces where safe.
- Reduce hotspot complexity in selected scripts.
- Expand test coverage and integration confidence.

## Files and Areas
- `.agents/scripts/*.py`
- `.agents/scripts/lib/*.py`
- `.agents/scripts/tests/*.py`
- `.agents/a-docs/standards/*.md`
- `.agents/a-docs/agentic/*.md`

## Risks
- Risk: hidden command behavior drift.
  - Mitigation: command parity matrix validated after each phase.
- Risk: complexity moved instead of reduced.
  - Mitigation: per-function C901 delta tracking.
- Risk: low-signal tests.
  - Mitigation: prioritize integration tests for real workflows.

## Verification
- Commands:
  - `make doctor`
  - `make lint`
  - `make test-scripts`
  - `make lint-scripts`
  - `make tools-check`
  - `make all`
  - `ruff check .agents/scripts --select C901`
  - `coverage report -m`
- Evidence:
  - Outputs captured in workstream `log` and `report`.

## Done When
- [ ] Baseline and parity matrix established.
- [ ] Targeted hotspot complexity reduced.
- [ ] No command regressions observed.
- [ ] Coverage and integration confidence improved.
- [ ] Final report includes evidence and follow-ups.

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
