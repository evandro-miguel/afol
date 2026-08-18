---
doc_type: spec-child
id: 260818_public-architecture-code-quality_spec-child_01
theme: public-architecture-code-quality
status: active
owners:
- orchestrator
workstream_intent: Measure and reduce proven architectural risk without speculative refactoring.
artifact_purpose: Define public engineering-quality evidence and hotspot boundaries.
created_at: '2026-08-18T00:00:00Z'
updated_at: '2026-08-18T00:00:00Z'
roadmap_feature: F-34
spec_role: child
parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260818_public-product-and-portfolio-readiness_spec_01.md
  plan: ''
  task: ''
  report: ''
risk_level: medium
---

# SPEC CHILD: Public Architecture and Code Quality

## Required Behavior

- Complexity, cycles, fan-in/out, churn, duplication, dead exports, dependency
  use, coverage scope, command latency, output size, and binary size are measured
  before refactoring.
- `main.ts` remains a composition root; command metadata is declarative and
  validated; domain rules stay out of handlers and adapters.
- Hotspots are decomposed only where evidence shows multiple responsibilities,
  unsafe coupling, or poor test isolation.
- Automated boundaries prevent command-to-domain inversion, unsafe direct
  filesystem/subprocess writes, and factory/template coupling.
- Coverage distinguishes critical selected surfaces from whole runtime.

## Acceptance

- [x] Architecture report records the baseline and every chosen refactor.
- [x] No known dependency cycle, dead export, lint, or type error remains.
- [x] Lock, mutation, release, and path boundaries have focused fault tests.
- [x] Public interfaces do not regress and coverage claims state their scope.

## Evidence

- `docs/public/architecture-quality.md` records module/line counts, churn,
  dependency concentration, selected complexity findings, coverage, binary
  size, command observations, and measurement limitations.
- Madge found one validation cycle; extracting
  `cli/validate/output-metrics.ts` removed it, and the repeated 406-module scan
  found zero cycles.
- Focused hot-path/validation tests passed 85/85; the configured toolchain,
  typecheck, Knip, and full source suite pass.
- High-complexity functions remain documented refactor candidates rather than
  being changed speculatively.
