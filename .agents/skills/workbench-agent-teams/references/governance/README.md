---
description: Roadmap and spec governance conventions for governed workstreams.
metadata:
  tags: "governance, roadmap, specs, workstreams, parent-spec, child-spec"
---

# Roadmap And Spec Governance

Use this reference when the repository follows roadmap-first delivery
and workbench artifacts must carry strategic intent through execution.

## Purpose

- A roadmap feature states what should happen at the product or system
  level.
- A parent spec defines the feature intent, user journey, scope,
  constraints, and acceptance.
- Child specs split large features into bounded objectives without
  replacing the parent goal.
- Workstream `spec` or `spec-lite` documents local delivery context
  for one execution track.

## Core Rules

- Every meaningful roadmap feature should map to one parent spec.
- Large features should define child specs before execution starts.
- Workstream execution docs should carry `roadmap_feature` and `parent_spec`.
- Local workstream specs refine delivery; they do not silently replace
  strategic decisions.
- If delivery exposes a missing strategic decision, pause and create or
  update the parent or child spec instead of improvising inside task
  docs.

## Artifact Roles

- `roadmap`: portfolio or feature intent at a higher level
- `spec`: full feature or child-spec document
- `spec-lite`: small, low-risk workstream refinement
- `blocks`: explicit blocker/escalation artifact for stalled delivery
- `plan` and `task`: execution sequencing, ownership, and status
- `report` and `postmortem`: proof of what happened and what was learned

## Spec Choice

- Use `spec` when the work changes user journey, scope boundaries,
  decomposition strategy, or acceptance philosophy.
- Use `spec-lite` when the work is localized and the parent spec
  already answers the important strategic questions.
- Use `blocks` when a task is stalled by ambiguity, dependency
  failure, or a missing decision that must be surfaced.

## Verification Principle

- Specs should define how execution will be trusted, not only what
  will be built.
- Good spec validation covers contract checks, primary workflow
  behavior, risky edges, and operational evidence.
- The spec should explain which classes of checks matter most, not
  prescribe code-level tests.
