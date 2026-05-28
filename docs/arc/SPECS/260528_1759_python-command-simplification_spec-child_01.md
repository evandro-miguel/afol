---
doc_type: spec-child
id: 260528_1759_python-command-simplification_spec-child_01
theme: python-command-simplification
status: final
owners:
- orchestrator
created_at: '2026-05-28T17:59:53-03:00'
updated_at: '2026-05-28T17:59:53-03:00'
roadmap_feature: F-15
spec_role: child
parent_spec: 260412_2004_repo-wide-simplification-runtime-parity_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  parent: docs/arc/SPECS/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md
  plan: .agents/wb/260528_1759_python-command-simplification/260528_1759_python-command-simplification_plan_01.md
  task: .agents/wb/260528_1759_python-command-simplification/260528_1759_python-command-simplification_task_01.md
  report:
risk_level: low
---

# SPEC CHILD: python-command-simplification

## Intent

- Outcome: execute the first bounded simplification batch for
  `.agents/scripts/agents-fix-symlinks.py` by reducing internal control-flow
  duplication while preserving CLI behavior and filesystem semantics.
- Roadmap feature: `F-15` (`docs/arc/GENERAL-ROADMAP.md#L224` and `#L229`).
- Parent spec: `260412_2004_repo-wide-simplification-runtime-parity_spec_01`
  with scope anchors at
  `docs/arc/SPECS/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md#L108`
  and `#L136`.

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- Use `spec-lite` only for historical compatibility during migration.

## Child Scope Rationale

- This slice exists to reduce script complexity hotspots in small safe batches.
- It is separate from runtime-registry and map-boundary slices because this
  batch is strictly Python script simplification with parity guarantees.

## User or Operator Journey

1. Operator runs `.agents/agents fix-symlinks` with existing flags.
2. Script performs the same symlink/copy decisions, dry-run output, and exit
   code behavior as before.
3. Validation gates prove parity and keep governed evidence for the slice.

## Boundaries

- In scope:
  - `.agents/scripts/agents-fix-symlinks.py`
  - `.agents/scripts/tests/test_agents_fix_symlinks.py`
  - `.agents/scripts/pyproject.toml` only if C901 ignore removal is justified
- Out of scope:
  - runtime registry or MCP/runtime package changes
  - map-boundary docs work
  - broad Python cleanup outside this script and its focused tests

## Risks and Mitigations

- Risk: silent CLI behavior drift during simplification -> Mitigation: preserve
  interfaces and run focused + broader script gates before completion.
- Risk: removing `C901` ignore prematurely -> Mitigation: only remove if lint
  passes without the per-file ignore in this batch.

## Acceptance

- [x] Child scope is explicit and bounded
- [x] Parent spec linkage is explicit
- [x] Journey is clear without code
- [x] Delivery evidence target is clear in linked report

---

*Child spec: `docs/arc/SPECS/260528_1759_python-command-simplification_spec-child_01.md`*
