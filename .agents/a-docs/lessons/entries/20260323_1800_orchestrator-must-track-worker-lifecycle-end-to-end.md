---
doc_type: lesson_entry
id: 20260323_1800_orchestrator-must-track-worker-lifecycle-end-to-end
status: active
created_at: '2026-03-23T18:00:00Z'
updated_at: '2026-03-23T17:25:45-03:00'
---

# Lesson: Orchestrators must own worker lifecycle end to end

## Trigger

- Delegated workers completed useful implementation slices, but orchestration lagged behind until the user explicitly pointed out that the main agent must keep tracking worker execution, know when they finish, and integrate the results directly instead of leaving the impression that workers were operating on their own.

## What Went Wrong

- Delegation happened correctly, but closure discipline was weak.
- The main agent did not immediately transition from delegation to active monitoring, integration, and final verification in a way that was visible and complete.

## Prevention Rule

- When workers are spawned for governed work, the orchestrator must keep explicit ownership of their lifecycle: monitor completion, review outputs, integrate changes, run final verification in the main repo, and only then treat delegated tasks as done.

## Guardrail

- Workbench task boards must not mark delegated slices as done until the orchestrator has validated them in the main repo.
- Final reports must distinguish worker delivery from orchestrator-verified completion.
