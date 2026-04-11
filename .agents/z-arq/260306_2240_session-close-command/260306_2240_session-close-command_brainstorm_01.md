---
doc_type: brainstorm
id: 260306_2240_session-close-command_brainstorm_01
theme: session-close-command
status: active
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_2240_session-close-command_plan_01
created_at: '2026-03-06T22:40:43-03:00'
updated_at: '2026-03-07T18:41:21-03:00'
---

# Brainstorm: session-close-command

## Problem Statement
- Agents can prove a session is complete through strict verification, but there is no explicit command that performs the closure gate and handles the active-session pointer coherently.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/agents`
  - `.agents/scripts/verify-tasks.py`
  - `.agents/scripts/agents-status.py`
  - `.agents/scripts/tests/test_execution_command_flow.py`
  - `README.md`
- Existing patterns or constraints to confirm:
  - Closure already means "final artifacts + strict verification pass"
  - Empty `.active_session` is allowed but generates a doctor warning
  - New command should reuse existing verification instead of creating another closure state

## Assumptions
- The correct implementation is a thin orchestration command, not a new workflow layer.
- Pointer reassignment should be optional because some operators may want to keep the closed session as the default context temporarily.

## Options
1. Add a dedicated `session close` wrapper command that runs strict verification and optionally repoints `.active_session`.
2. Extend `wb-update` with a `close` subcommand and mix session lifecycle into metadata automation.
3. Keep the current workflow and rely on docs only.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Explicit operator UX, low implementation cost, reuses current invariants | Adds one more top-level command | low | low |
| B | Reuses an existing automation surface | Blurs metadata updates with lifecycle policy | medium | medium |
| C | No code change | Keeps user confusion and manual closure handling | high | low |

## Preferred Direction
- Selected: Option A
- Why: It gives agents a single, explicit closure entrypoint without changing what "closed" means internally.
- Rejected options:
  - Option B -> `wb-update` should remain focused on low-value document mutations.
  - Option C -> the current system is correct but too implicit for operators.

## Decision Criteria
- Closure must be gated by the already-trusted strict verifier.
- The command must not invent a new report/task/postmortem state model.
- Pointer behavior must be explicit and predictable.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether leaving `.active_session` empty is acceptable
  - Whether tool catalog/runtime docs need command updates
- Knowledge to reuse before planning:
  - Existing F-08 execution-command tests and wrapper help text

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
