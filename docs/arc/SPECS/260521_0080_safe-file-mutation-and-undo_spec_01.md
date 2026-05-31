---
doc_type: spec
id: 260521_0080_safe-file-mutation-and-undo_spec_01
theme: safe-file-mutation-and-undo
status: final
owners:
- orchestrator
created_at: '2026-05-21T01:20:00+08:00'
updated_at: '2026-05-29T13:20:21-03:00'
roadmap_feature: F-08
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - cli/files cli/mutations
  - .agents/data
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: safe-file-mutation-and-undo

## 1) Feature Intent

Give agents safe commands for project file operations.

## 2) Problem

Agents can move, overwrite, or generate files incorrectly. Without journaling,
inspection and undo are hard.

## 3) Expected Behavior

Mutating file commands support dry-run, session/task context, reason, mutation
id, event log, rollback when feasible, and protected path checks.

2026-05-31 DR addendum:

- Real mutation writes require project-scoped path-jail and symlink safety checks.
- Write operations are atomic and journaling-first.
- Backup and undo workflows are required where feasible, with mutation ids and
  session/task traceability.
- Patch and diff tooling must be deterministic and preview-driven, with diff/jsdiff as safety target.

## 4) Product Boundary

The universal CLI owns reusable behavior. The project-local template owns local
state, rules, skills, workbench artifacts, specs, evidence, logs, config, and
update metadata. Current Python/uv/Bash behavior remains compatibility contract
until Bun/TypeScript parity is proven by focused tests.

## 5) Scope

In scope: Write, move, patch, archive, undo, dry-run, mutation journal,
protected path policy.

Out of scope: Guaranteed undo for every binary file, replacing git, autonomous
broad refactors, mutating files outside project root.

## 6) Acceptance

Mutations are recorded; dry-run shows intent with patch preview; undo works where
supported; protected paths are blocked; common moves do not require manual file
handling; backups are retained for supported operations.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?

## 8) Closure

- Accepted implementation evidence: `E-20260528122615973830`.
- Closeout session: `.agents/wb/260528_1145_f08-safe-file-mutation-undo/`.
- Strict verification: `./.agents/agents verify-tasks --strict .agents/wb/260528_1145_f08-safe-file-mutation-undo/` passed.
- Board cleanup accepted in `cb2e024`.

## 9) Hermes Benchmark Decisions

- Pattern: security and approval guard before mutation.
- Hermes source concept: approval/security guard classifies side effects and
  requires explicit policy before dangerous operations run.
- Local decision: adapt as fail-closed noninteractive behavior with
  path/env/secret guardrails, denylist policy, and auditable bypass records.
- Acceptance criteria: dangerous noninteractive operations fail closed;
  protected paths and secret-bearing inputs are blocked or redacted; bypasses
  require an explicit flag, reason, and event/mutation journal entry.
- Non-goals: no auto-approval for destructive operations, no mutation outside
  the project root, no raw browser/CDP control by default.
