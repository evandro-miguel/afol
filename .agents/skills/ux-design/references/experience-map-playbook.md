---
description: Use when mapping desired end-to-end experiences across users, customers, touchpoints, channels, evidence, service dependencies, and metrics.
metadata:
  tags: "ux, experience-mapping, journey-mapping, service-design, touchpoints, metrics, strategy"
---

# Experience Map Playbook

Use this reference when the question is bigger than a screen or one product
flow. The goal is to understand the experience people need, what currently
happens, where the experience breaks, and which product or service decisions
should change.

Do not map everything. Map the smallest slice that can change a decision.

## Choose The Artifact

| Artifact | Use When | Captures | Avoid When |
| --- | --- | --- | --- |
| Task flow | A specific task needs a clear step sequence. | Steps, branches, errors, recovery. | The problem spans channels, time, or teams. |
| User flow | A product path needs design or validation. | Screens, states, decisions, system responses. | The main issue is expectation, policy, support, or operations. |
| Journey map | A user or customer scenario unfolds over time. | Phases, actions, thoughts, emotions, touchpoints, pain points. | You need the internal delivery model. |
| Experience map | The behavior is broader than one product or brand. | Human need, context, channels, motivations, friction, opportunity. | The scope is already one narrow transaction. |
| Service blueprint | The user experience depends on internal delivery. | Customer actions, frontstage, backstage, systems, handoffs, support process. | You only need interface-level design. |
| IA map | Users cannot find, classify, or understand content. | Structure, labels, navigation, taxonomy, entry points. | The issue is service delivery or emotional journey. |

If two artifacts fit, start with the one that answers the next decision. Add a
second map only when it reveals a different class of problem.

## Required Inputs

- Desired outcome: what the user or customer is trying to make true.
- Audience: primary user, secondary actors, customers, support, operations, or
  other affected groups.
- Scenario: trigger, context, constraints, timing, and stakes.
- Touchpoints: product screens, email, docs, support, sales, billing, policy,
  logistics, integrations, notifications, and handoffs.
- Evidence: interviews, observation, analytics, support tickets, sales notes,
  logs, surveys, usability tests, market research, or stakeholder knowledge.
- Business and service constraints: policy, cost, risk, legal, compliance,
  staffing, SLA, data availability, technical limits.
- Current metrics: task success, drop-off, error rate, time to value,
  activation, retention, support contact rate, refund rate, complaint themes,
  SUS, UMUX-Lite, CES, or NPS when it is actually relevant.

Separate each input into:

```text
Fact / Assumption / Unknown
```

Do not let an assumption enter the final strategy without a validation step.

## Mapping Workflow

### 1. Define The Slice

Write one sentence:

```text
For [user], map the experience of [scenario] from [start] to [finish] so we can decide [decision].
```

Good slice:

```text
For first-time sellers, map the experience of publishing the first item from signup to first qualified buyer message so we can decide what onboarding to simplify.
```

Bad slice:

```text
Map the marketplace UX.
```

### 2. Map The Current Experience

Use this structure:

| Phase | User action | Thought or question | Emotion or risk | Touchpoint | Evidence | Friction | Opportunity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Trigger |  |  |  |  |  |  |  |
| Entry |  |  |  |  |  |  |  |
| Progress |  |  |  |  |  |  |  |
| Decision |  |  |  |  |  |  |  |
| Completion |  |  |  |  |  |  |  |
| Aftermath |  |  |  |  |  |  |  |

Rename phases to fit the real journey. Keep phase count small enough to scan.

### 3. Add Service Delivery When Needed

Use a service blueprint layer when friction depends on internal delivery:

| Journey phase | Customer action | Frontstage | Backstage | Systems/data | Policy/SLA | Failure mode |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

Look for handoffs, queues, approvals, manual work, unclear ownership, missing
data, conflicting policies, and support scripts that create user friction.

### 4. Diagnose Friction

Classify each issue:

```text
Blocks outcome / causes error / creates doubt / increases effort / reduces trust / only annoys
```

Then classify root:

```text
Interface / information architecture / content / expectation / policy / data / operations / technical constraint / external dependency
```

Fix roots before symptoms. A prettier screen does not fix a broken handoff.

### 5. Choose Metrics

Pick one primary metric and two or three guardrails.

| Goal | Primary Metric | Guardrails |
| --- | --- | --- |
| Complete a task | Task success rate | Error rate, time on task, help requests |
| Reduce abandonment | Funnel completion | Segment drop-off, error rate, support contacts |
| Reach first value | Activation or time to value | Retention, setup errors, skipped steps |
| Improve trust | CES, complaint themes, support sentiment | Refunds, reversals, escalation rate |
| Improve usability perception | SUS or UMUX-Lite | Task success, qualitative pain points |
| Improve long-term value | Retention or repeat use | Cohort quality, churn reasons, support volume |

Avoid NPS as the main diagnostic metric for a local UX problem. It is a broad
loyalty signal, not a repair manual.

### 6. Define The Target Experience

For each phase, decide:

- What should the user know now?
- What should the user be able to do now?
- What should the system or service handle for them?
- What should happen if the happy path fails?
- What evidence would show this is better?

Use this output:

| Phase | Target behavior | Change needed | Owner | Metric | Validation |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

### 7. Convert To Work

Convert findings into the smallest useful work items:

- Product: scope, rule, priority, experiment, or roadmap decision.
- Design: flow, content, state, IA, or prototype change.
- Engineering: route, state, validation, event, data, integration, or recovery
  path.
- Service: handoff, policy, support script, SLA, role, or operating process.
- Research: interview, usability test, survey, analytics read, or benchmark.

Every item should reference the phase, friction, evidence, metric, and expected
outcome. If it cannot, it is probably a vague recommendation.

## Output Shape

When reporting an experience map, use:

1. Scope mapped.
2. Desired outcome.
3. Current experience summary.
4. Evidence used.
5. Highest-impact frictions.
6. Root causes.
7. Target experience.
8. Metrics and guardrails.
9. Product, design, engineering, service, or research tasks.
10. Unknowns and validation plan.

## Common Failure Modes

- Mapping the whole business instead of the decision slice.
- Treating stakeholder guesses as research.
- Mixing current state and target state in the same row.
- Drawing emotions without evidence.
- Using only quantitative data and never asking why.
- Using only interviews and never checking scale.
- Fixing screens when the root cause is policy, content, support, or data.
- Adding a second artifact before the first one changes a decision.
