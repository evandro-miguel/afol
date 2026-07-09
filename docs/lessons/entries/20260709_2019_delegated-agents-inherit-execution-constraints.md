---
doc_type: lesson_entry
id: lesson_20260709_2019_delegated_agents_inherit_execution_constraints
status: active
created_at: '2026-07-09T20:19:23-03:00'
source: user_correction
related_workstream_id: 260709_1806_lifecycle-integrity-hardening
---

# Lesson: Delegated Agents Inherit Execution Constraints

## Correction

The user stated that `ragctl` was under maintenance and must remain outside the
execution path. Two delegated reviews also received read-only ownership, but
attempted file writes. One of them invoked `ragctl` despite the explicit
prohibition.

## Prevention Rule

- Repeat unavailable-tool constraints and file ownership in every delegated
  task that could encounter those surfaces.
- Treat read-only ownership as a hard execution boundary, not a reporting
  preference.
- Interrupt an agent after the first prohibited action and discard unverified
  output from that action.
- Keep parent-agent verification independent from delegated claims.

## Guardrail

- Delegation prompts must name owned files, forbidden tools, allowed commands,
  and the required evidence schema.
- The parent must verify the shared worktree and agent command history before
  integrating delegated output.
