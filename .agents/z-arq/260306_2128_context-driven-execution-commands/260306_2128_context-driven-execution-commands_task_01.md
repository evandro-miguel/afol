---
doc_type: task
id: 260306_2128_context-driven-execution-commands_task_01
theme: context-driven-execution-commands
status: active
owners:
- worker
- tester
created_at: '2026-03-06T21:28:26-03:00'
updated_at: '2026-03-06T22:34:26-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
depends_on:
- 260306_2128_context-driven-execution-commands_plan_01
links:
  plan: 260306_2128_context-driven-execution-commands_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: context-driven-execution-commands

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | orchestrator | Draft the F-08 child specs and define acceptance boundaries for each slice. |
| T-02 | done | worker | Implement the artifact-resolution layer for logical document names and active workbench artifacts. |
| T-03 | done | worker | Add canonical project-context docs plus setup/resume behavior. |
| T-04 | done | worker | Implement `status` using the new artifact-resolution layer and existing workbench state. |
| T-05 | done | worker | Implement `implement` so it advances governed task execution using workflow rules and evidence updates. |
| T-06 | done | worker | Implement `review` against plan, spec, workflow, guidelines, and changed scope. |
| T-07 | done | worker | Implement logical `revert` for task, phase, pack, or session while keeping workbench state synchronized. |
| T-08 | done | tester | Align runtime mirrors/docs and add verification coverage for the new command set. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ...

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [ ] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [ ] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [ ] roadmap-first delivery rules
  - [ ] metadata update policy
- Docs useful for this task:
  - [ ] `.agents/arc/SPECS/260306_context-driven-execution-commands_spec_01.md`
  - [ ] `.agents/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md`
  - [ ] `.agents/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md`
- Skills useful for this task:
  - [ ] `agentic-system-workflow`
- Integrations useful for this task:
  - [ ] upstream Conductor command references

## Implementation Checkpoint
- Files touched:
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/SPECS/260306_context-driven-execution-commands_spec_01.md`
  - `.agents/arc/SPECS/260306_artifact-resolution-layer_spec_01.md`
  - `.agents/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md`
  - `.agents/arc/SPECS/260306_guided-status-and-implementation_spec_01.md`
  - `.agents/arc/SPECS/260306_review-and-logical-revert_spec_01.md`
  - `.agents/arc/SPECS/260306_runtime-command-parity_spec_01.md`
  - `.agents/arc/PROJECT-BRIEF.md`
  - `.agents/arc/ENGINEERING-GUIDELINES.md`
  - `.agents/arc/TECH-STACK.md`
  - `.agents/scripts/agents-status.py`
  - `.agents/scripts/agents-implement.py`
  - `.agents/scripts/agents-review.py`
  - `.agents/scripts/agents-revert.py`
  - `.agents/scripts/lib/execution_commands.py`
  - `.agents/scripts/tests/test_execution_command_flow.py`
  - `.agents/scripts/pyproject.toml`
  - `.agents/scripts/README.md`
  - `.agents/a-docs/standards/scripts-usage.md`
  - `.agents/wb/260306_2128_context-driven-execution-commands/*`
- Key decisions:
  - Selective adoption of Conductor ideas only.
  - Artifact resolution and status remained the foundation, but the full `implement` / `review` / `revert` path shipped in the same feature cycle.
  - Canonical project context lives in `.agents/arc` and is consumed by the shared resolver instead of duplicating a new governance tree.
  - Git supports logical revert but does not replace workbench authority.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make lint`
- Result: pass
- Evidence: `Files checked: 248`, `Issues found: 0`
- Command: `make lint-scripts`
- Result: pass
- Evidence: `All checks passed!`
- Command: `make test-scripts`
- Result: pass
- Evidence: `89 passed, 5 deselected`
- Command: `make all`
- Result: pass
- Evidence: full aggregate validation completed successfully
- Command: `./.agents/agents status --json`
- Result: pass
- Evidence: active session resolved, canonical artifacts returned, next task resolution valid
- Command: `./.agents/agents implement next`
- Result: pass
- Evidence: returned in-progress task deterministically
- Command: `./.agents/agents review --scope task`
- Result: pass/fail semantics corrected
- Evidence: now emits scoped severity findings instead of false green output
- Command: `./.agents/agents revert task --session 260306_2128_context-driven-execution-commands --task-id T-04 --to-state pending`
- Result: pass
- Evidence: command prints preview and requires explicit `--confirm` before mutating state
