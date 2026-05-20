# ExecPlans for This Repository

This repository uses an ExecPlan-style planning system for non-trivial work. In this scaffold, the canonical ExecPlan lives inside the governed workbench session at:

- `.agents/wb/<session_id>/<session_id>_plan_01.md`

Treat that workbench plan as the execution contract for the session. It must remain readable, self-contained, and useful even to a contributor who only has the current working tree and the plan file.

## When to use an ExecPlan

Use an ExecPlan when the work is complex enough that a stateless interactive CLI agent or a new human contributor could lose context without a durable execution document. Typical triggers:

- complex features
- significant refactors
- multi-hour investigations that turn into implementation
- changes that cross multiple files or systems
- work that may require stopping and resuming later

Do not use an ExecPlan as a replacement for roadmap or parent spec governance. In this repository:

- roadmap defines feature inventory and status
- parent spec defines feature philosophy and acceptance
- workbench ExecPlan defines the concrete execution path for a session

An ExecPlan is not a container for pre-planning, generic discovery, broad
research, or "create the real plan" tasks. Do needed discovery before writing or
revising the plan, then fold findings into facts, assumptions, risks, scope,
sequencing, and validation. Create a research, brainstorm, or explorer-check
artifact only when it is the requested deliverable or the smallest blocking
proof before safe execution.

## Non-negotiable requirements

- Every ExecPlan must be self-contained enough for a novice contributor to continue the work from the plan and the repository alone.
- Every ExecPlan is a living document. Update it as progress happens, discoveries appear, or design decisions change.
- Every ExecPlan must explain user-visible or operator-visible outcomes, not just code edits.
- Every ExecPlan must name the relevant files, modules, commands, and expected observations explicitly.
- Every ExecPlan must keep phases tied to concrete implementation, change,
  decision, artifact, or validation outcomes for the requested work.
- Every finalized ExecPlan must maintain the sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective`.

## Required structure in this scaffold

The canonical template is `docs/templates/plan.md`. It must include, at minimum:

- `Purpose / Big Picture`
- `Progress`
- `Surprises & Discoveries`
- `Decision Log`
- `Outcomes & Retrospective`
- `Context and Orientation`
- `Plan of Work`
- `Concrete Steps`
- `Validation and Acceptance`
- `Idempotence and Recovery`
- `Artifacts and Notes`
- `Interfaces and Dependencies`

`Progress` is mandatory and must use checkbox items with timestamps so the current state is obvious at any stopping point.

## Writing guidance

- Write the plan in plain English.
- Prefer prose for narrative sections; use lists only when they make execution clearer.
- Define non-obvious terms when first introduced.
- Name full repository-relative paths when describing where to edit.
- State working directory and exact commands for validation steps.
- Phrase acceptance in observable behavior, not only internal implementation terms.
- If you change course during execution, update both the `Decision Log` and `Progress`.
- If you discover an unexpected bug, limitation, or tradeoff, record it in `Surprises & Discoveries` with short evidence.

## Completion rule

Before a session is considered complete:

- the ExecPlan must reflect the actual path taken
- the final report and any optional artifact that exists must agree with the plan outcome
- strict verification must pass for the session

This file is the canonical ExecPlan contract for this repository.
