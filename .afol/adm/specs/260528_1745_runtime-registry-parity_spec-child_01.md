---
doc_type: spec-child
id: 260528_1745_runtime-registry-parity_spec-child_01
theme: runtime-registry-parity
status: final
owners:
- orchestrator
created_at: '2026-05-28T17:45:46-03:00'
updated_at: '2026-05-28T17:45:46-03:00'
roadmap_feature: F-15
spec_role: child
parent_spec: 260412_2004_repo-wide-simplification-runtime-parity_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md
  plan: .afol/wb/260528_1745_runtime-registry-parity/260528_1745_runtime-registry-parity_plan_01.md
  task: .afol/wb/260528_1745_runtime-registry-parity/260528_1745_runtime-registry-parity_task_01.md
  report:
risk_level: low
---

# SPEC CHILD: runtime-registry-parity

## Intent

- Outcome: keep runtime command metadata parity between wrapper help fallback,
  `agentic command-registry`, `repo://command-registry`, and command catalog
  cross-check expectations, without expanding command families or changing the
  public CLI contract.
- Roadmap feature: `F-15`
- Parent spec: `260412_2004_repo-wide-simplification-runtime-parity_spec_01`

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- Use `spec-lite` only for historical compatibility during migration.

## Child Scope Rationale

- This slice exists to remove metadata drift and lock parity with focused
  assertions.
- It is separate from map-boundary and Python simplification slices because the
  risk here is command registry contract drift across runtime surfaces.

## User or Operator Journey

1. Operator runs `.agents/agents help` and sees runtime-backed command help.
2. Operator runs `agentic command-registry` and receives command + help payload
   consistent with the wrapper surface.
3. MCP consumer reads `repo://command-registry` and sees the same command/help
   contract used by CLI consumers.

## Boundaries

- In scope:
  - `.agents/runtime/src/agentic_scaffold/{registry.py,runtime.py,cli.py}`
  - focused runtime/scripts parity tests
  - workbench evidence for this session
- Out of scope:
  - new MCP tools/resources/prompts/widgets
  - command-family expansion or CLI contract redesign
  - broad `.afol/adm/tools.json` redesign

## Risks and Mitigations

- Risk: wrapper and runtime registry drift again -> Mitigation: assert command
  map parity directly in tests.
- Risk: MCP and CLI payloads diverge -> Mitigation: make runtime resource emit
  the shared command/help payload and test both consumers.

## Acceptance

- [x] Child scope is explicit and bounded
- [x] Parent spec linkage is explicit
- [x] Journey is clear without code
- [x] Delivery evidence target is clear in linked report

---

*Child spec: `docs/arc/SPECS/260528_1745_runtime-registry-parity_spec-child_01.md`*
