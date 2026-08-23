---
doc_type: spec-child
id: 260822_2023_warn-vs-block-advisory-gates_spec-child_01
theme: warn-vs-block-advisory-gates
status: active
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Freeze the warning-versus-hard-block contract for routine AFOL validation and lifecycle gates, and export the same contract to downstream projects.
created_at: '2026-08-22T20:23:00Z'
updated_at: '2026-08-22T20:23:00Z'
roadmap_feature: F-11
spec_role: child
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md
  related:
  - .afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md
  - .afol/adm/specs/260612_temporal-health-freshness-token-budget_spec-child_01.md
scope:
  repo_areas:
  - cli/services/health
  - cli/services/project
  - cli/services/workbench
  - cli/tests
  - src/project-template
risk_level: medium
---

# SPEC CHILD: warn-vs-block-advisory-gates

## Intent

- Outcome: Routine AFOL hygiene findings (administration, structure maps,
  stale sessions, rebuildable indexes, memory/library/context health, token
  budget, pending specs, generic Markdown checklists) are visible warnings that
  never stop delivery, while unsafe or unsuccessful operations still fail
  closed. The same contract is stated once in the downstream template.
- Roadmap feature: `F-11`
- Parent spec: `260521_0110_validation-ci-and-benchmarks_spec_01`

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- This is a residual active child of a final parent; it exists so governance
  resolution can bind new sessions without reopening final features.

## Child Scope Rationale

Live defects are policy coupling, not missing lifecycle machinery: routine
health and project-validation hygiene returns failure severity and exit 1, and
one non-task checklist warning blocks strict verify and close. This child owns
the single behavior matrix and its S0-S2 implementation slices. It is separate
from sibling children because it changes gate severity policy across health,
project validation, and workbench completion at once, under one contract.

## Behavior Contract

| Operation | Warning-only | Hard block |
| --- | --- | --- |
| `afol health` / `full` / `--area` | Administration, PSTR, stale sessions, rebuildable indexes/DBs, memory/library/ctx/evolution health, token budget | Unreadable canonical session directory or invalid event ledger |
| `afol health --release` | None: promote routine warnings for the explicit release check | Any warning/failure, preserving a strict local release surface |
| `afol validate project` | Administration/provider/template layout, derived local indexes, toolchain claims, optional drift, pending specs | Invalid config, missing workbench root, invalid event ledger, unreadable/corrupt session state, blocking evidence issue |
| `afol validate project --strict` | Pending specs and generic checklist items remain warnings by product law | Every other raw failed project check |
| `afol verify-tasks --strict` | `open_checklist_item` remains reported, but exits 0 when it is the only issue and no task is open | Missing/failed/invalid evidence, invalid/duplicate task state, missing session/tasks, or any open lifecycle task |
| `afol close` | Generic checklist warning is returned compactly | Open task unless carry-open; any blocking verifier issue |
| `afol close --admit-legacy-baseline` | Same checklist warning behavior | Any issue not covered by the exact hash/cutoff admission or the warning predicate |

This table is the complete classification. No extra gates are introduced.

## User or Operator Journey

1. Agent runs `afol v project` or `afol health` mid-delivery with messy
   administration or a stale index.
2. Findings are reported as warnings; exit stays 0 and lifecycle continues.
3. Missing observed evidence, an open task, corrupt state, or an invalid ledger
   still stops the exact operation with exit 1.

## Boundaries

In scope:

- Warning/failure classification for health, project validation, strict task
  verification, and close (including legacy retry admission), slices S0-S2.
- One concise statement of this matrix in `src/project-template/AGENTS.md`.
- Focused test updates covering default advisory versus strict/release modes.

Out of scope:

- Auto-close, reopening done tasks, done-but-open status (S3), lint engines,
  hosted CI, status-derived lifecycle, new state fields, compatibility wrappers,
  retired `.agents` runtime surfaces, root doctrine rewrites, and ADR-009
  changes.

## Risks and Mitigations

- Advisory defaults can hide real decay -> keep every finding reported, keep
  release and strict modes failing closed, and keep corruption/evidence blocks
  untouched.
- Classification drift between verifier and close paths -> use one shared
  blocking-issue predicate everywhere instead of duplicated checks.
- Template text drifts from this spec -> template states the matrix once,
  verbatim in meaning, and template checks guard payload parity.

## Acceptance

- [ ] Child scope is explicit and bounded to S0-S2.
- [x] Parent spec linkage is explicit (`F-11`, parent
      `260521_0110_validation-ci-and-benchmarks_spec_01`).
- [ ] Default health/project validation treats listed hygiene as warnings with
      exit 0; release/strict modes still fail on them.
- [ ] Strict verify and close pass with done tasks, passed evidence, and only a
      generic unchecked checklist item, while reporting the warning.
- [ ] Missing evidence, open tasks outside carry-open/admission, invalid
      ledgers, and corrupt state still block in every mode.
- [ ] Downstream template states the same matrix exactly once;
      `bun run template:check` passes.

---

*Template: `docs/templates/spec-child.md`*
