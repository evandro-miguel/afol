---
description: Use when mapping a UX flow, finding friction, prioritizing flow problems, or converting UX problems into frontend tasks.
metadata:
  tags: "ux, flow, journey, friction, prioritization, frontend-tasks"
---

# UX Flow Playbook

Use this playbook when a task depends on a sequence of user actions, decisions,
system states, and recovery paths.

## Flow Analysis Method

1. Name the flow.
2. Define the primary user.
3. Define the user goal.
4. Define the success result.
5. List the entry point.
6. List every step.
7. List decisions.
8. List requested data.
9. List possible errors.
10. List recovery paths.
11. List empty, loading, success, and failure states.
12. List the exit from the flow.
13. Identify friction.
14. Prioritize by impact.
15. Convert improvements into implementable tasks.
16. Define tests and metrics.

## Textual Flow Template

```text
Flow: [name]
User: [type]
Goal: [expected result]
Context: [journey moment]

Step 1: [action or screen]
- Information shown:
- User decision:
- System state:
- Possible friction:
- Possible error:
- Recovery:

Step 2: ...

Success:
- What does the user see?
- What can they do next?
- How do they know the task is complete?
```

## Required Paths

Include the paths that can materially change design or implementation:

- Happy path. Error path. Recovery path. Empty state path. First-time user path.
  Returning user path. Mobile path. Accessibility path. Permission denied path.
  Offline or partial-failure path when relevant.

## Friction Ranking

Use this order:

1. Blocks completion.
2. Causes expensive or irreversible error.
3. Causes abandonment.
4. Causes loss of trust.
5. Causes frequent confusion.
6. Increases effort but does not block.
7. Is only polish.

## UX Problem To Frontend Task

| UX problem | Frontend task |
| --- | --- |
| User does not know if an action worked | Add status feedback. |
| User enters the wrong format | Show help before input and validate. |
| User abandons a long step | Split steps and preserve partial data. |
| User does not know where they are | Add breadcrumb, title, or nav state. |
| User fears a destructive action | Add confirm, preview, undo, or clear copy. |
| Empty state does not help | Explain the cause and next action. |
| Loading creates anxiety | Add skeleton, progress, or status. |
| Disabled control is mysterious | Explain what is missing or validate. |
| User cannot recover from an error | Offer retry, back, support, or fallback. |

## Anti-Self-Deception Questions

- Does this solve the task or just add more UI? Would the user understand
  without my explanation? Is the language the user's language? Does the flow
  prevent errors or only punish them afterward? Is there a clear exit? Is there
  a path for both new and advanced users? Can this improvement be validated? Is
  the implementation proportional to the risk?

## Flow Review Output

For a flow review, produce:

1. Flow name and user goal.
2. Current or proposed steps.
3. High-impact friction.
4. Recommended flow changes.
5. Required interface states.
6. Frontend tasks.
7. Validation method and metric.
