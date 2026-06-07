---
doc_type: spec-child
id: 260528_2022_runtime-mirror-cleanup_spec-child_01
theme: runtime-mirror-cleanup
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Capture the canonical child spec for the runtime mirror cleanup slice.
created_at: 2026-05-28T20:22:03-03:00
updated_at: 2026-05-29T15:37:22-03:00
roadmap_feature: F-17
spec_role: child
parent_spec: 260413_1849_just-command-runner-migration_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260528_2022_runtime-mirror-cleanup_plan_01
  task: 260528_2022_runtime-mirror-cleanup_task_01
  report: .afol/wb/260528_2022_runtime-mirror-cleanup/260528_2022_runtime-mirror-cleanup_report_01.md
risk_level: low
---

# SPEC CHILD: runtime-mirror-cleanup

## Intent

- Outcome: Canonical/runtime mirror docs describe the current Just-first command contract and no longer present Make as a required project command entrypoint or verification stack.
- Roadmap feature: `F-17`
- Parent spec: `260413_1849_just-command-runner-migration_spec_01`

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- Use `spec-lite` only for historical compatibility during migration.

## Child Scope Rationale

- Keep runtime mirror cleanup separate from command-parity and template-wiring slices so the doc drift can be fixed and verified without broadening into CI or runtime code.
- This slice is narrowly about mirror wording and canonical docs, not command implementation changes.

## User or Operator Journey

1. A maintainer opens `AGENTS.md`, `CLAUDE.md`, or `docs/arc/TECH-STACK.md` to confirm the supported command surface.
2. The mirror docs point to `just` as the project command entrypoint and aggregate validator.
3. The reader does not get sent to Make for a required workflow path.

## Boundaries

- In scope:
  - `docs/arc/TECH-STACK.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `src/project-template/AGENTS.md`
  - `src/project-template/CLAUDE.md`
- Out of scope:
  - CI workflow edits
  - runtime package code
  - MCP registration/tool code
  - broad archival docs outside the allowed mirror set

## Risks and Mitigations

- Mirror docs could still drift apart after the patch -> keep AGENTS/CLAUDE pairs identical and verify with targeted `rg` checks.
- Make may remain legitimate in migration-specific docs elsewhere -> do not expand scope beyond the allowed mirror set.

## Acceptance

- [x] Child scope is explicit and bounded
- [x] Parent spec linkage is explicit
- [x] Journey is clear without code
- [x] Delivery evidence target is clear in linked report

## Closure

- Evidence: `E-20260528202913194559`
- Report: `.afol/wb/260528_2022_runtime-mirror-cleanup/260528_2022_runtime-mirror-cleanup_report_01.md`

---

*Template: `docs/templates/spec-child.md`*
