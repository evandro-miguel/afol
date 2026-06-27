---
name: ux-design
description: Use when creating, auditing, or improving UX flows, end-to-end experiences, states, and usability.
metadata:
  category: ux
  tags: "ux, user-experience, experience-mapping, flows, journeys, service-design, touchpoints, forms, onboarding, microcopy, usability, accessibility, metrics"
  triggers: "ux design, experience mapping, desired experience, customer journey, service blueprint, touchpoint map, behavior metrics, user flow, journey audit, onboarding ux, form ux, microcopy, empty state, error state, usability validation, web interface audit"
  references: "experience-map-playbook, ux-flow-playbook, ux-state-patterns, ux-validation-metrics, web-interface-audit, sources"
  version: "1.1.0"
  updated_at: "2026-06-27T00:00:00Z"
  target_provider: universal
---

# UX Design

Use this skill when the task is to make a product, service, or digital
experience clearer, more trustworthy, more efficient, or easier to recover
from. UX success means the user reaches the right outcome with less effort,
less doubt, and more control.

If the main problem is visual composition, design-system fit, frontend component
quality, typography, spacing, or motion polish, also use `ui-design`.

## Operating Principle

Do not start with the screen. Start with the desired outcome.

```text
User
-> Context
-> Goal
-> Touchpoints
-> Task
-> Journey
-> Evidence
-> States
-> Friction
-> Solution
-> Test
-> Metric
```

A good experience map shows where the user is, what happens next, which
touchpoints matter, what risks exist, what the organization must support, how to
recover, and how to finish. It does not expose every option at once or hide
critical feedback behind vague UI.

## Required Inputs

Gather or infer these before changing UX:

- Primary user. Customer or actor group. Desired outcome. Task the user is
  trying to complete. Moment in the journey. Entry channel. Touchpoints.
  Expected result. Risk perceived by the user. Information the user already has.
  Information the user needs now. Required decisions and removable decisions.
  Evidence from research, analytics, support, sales, logs, or observation.
  Possible errors and recovery paths. Interface states. Success metrics.
  Operational, technical, legal, business, or accessibility constraints.

If information is missing, proceed with explicit assumptions and identify how to
validate them.

## Workflow

### 1. Understand The User And Task

Answer:

- Who is using this? What are they trying to do? Why now? What happens if they
  make a mistake? What are they worried about? What words would they use for the
  task? Which channels, people, systems, or policies shape the experience?

Expected result: user, context, main task, touchpoints, and expected outcome.

### 2. Choose The Right Map

Use the smallest artifact that answers the question:

- Task flow or user flow: steps inside a product.
- Journey map: timeline for a scenario, goal, or service.
- Experience map: broader human behavior across channels or time.
- Service blueprint: journey plus frontstage, backstage, systems, and handoffs.
- Information architecture map: structure, labels, navigation, and findability.

Read [experience-map-playbook.md](./references/experience-map-playbook.md) when
the problem spans multiple channels, actors, touchpoints, or organizational
dependencies.

### 3. Map The Flow

Map:

- Entry point. Steps. Decisions. Data requested. Feedback. Possible errors.
  Touchpoints. Frontstage and backstage dependencies when relevant. Recovery
  paths. Success and exit. Return path to the previous flow.

Include happy path, error path, recovery path, empty state path, first-time user
path, returning user path, mobile path, and accessibility path when relevant.

Read [ux-flow-playbook.md](./references/ux-flow-playbook.md) for the full flow
mapping template.

### 4. Identify Friction

Look for:

- Unnecessary decisions. Questions asked too early. Internal terminology.
  Ambiguous CTAs. Errors without recovery. Loading without context. Empty states
  without next actions. Forms that are longer than necessary. Navigation without
  orientation. Destructive actions without confirmation, preview, undo, or clear
  copy. Missing feedback after click. Important information shown too late.
  Tooltips used to compensate for unclear UI. Inaccessible interaction patterns.

Classify each issue:

```text
Blocks task / causes error / creates doubt / creates anxiety / only annoys
```

### 5. Prioritize By Impact

Prioritize problems that block task completion, cause expensive errors, affect
many users, affect vulnerable or accessibility-dependent users, increase
abandonment, reduce trust, or are cheap to fix with high gain.

Do not prioritize only what looks visually weak.

### 6. Design An Implementable UX Fix

For each problem, propose:

- Flow change. Information change. Microcopy change. Interface state change.
  Component behavior change. Timing change. Test or metric.

The solution should reduce effort, doubt, or risk. If it only adds more UI,
question it.

### 7. Convert UX Into Product Or Frontend Tasks

Translate decisions into:

- Product decisions. Service changes. Routes. Components. State machines or
  local state. Validations. Messages. Loading, empty, error, success, disabled,
  permission, and offline states. Permissions and recovery paths. Analytics
  events. Tests.

Example:

```text
Problem: user does not know why a button is disabled.
Frontend task: add contextual helper text, use accessible tooltip only when
needed, validate at the right time, and test the disabled state.
```

### 8. Validate

Choose the smallest method that can answer the uncertainty:

- Heuristic review. Five-second test. First-click test. Moderated usability
  test. Representative internal user test. Before/after analytics. Completion
  rate. Time on task. Error rate. Drop-off rate. Support tickets. SUS,
  UMUX-Lite, or Customer Effort Score.

Do not claim the UX improved only because the screen looks better.

Read [ux-validation-metrics.md](./references/ux-validation-metrics.md) for
method selection and interpretation.

## Task Modes

### Map A Desired End-To-End Experience

1. Define the desired outcome.
2. List users, customers, actors, and affected teams.
3. List channels and touchpoints.
4. Separate facts, assumptions, and unknowns.
5. Map the current experience.
6. Mark friction, emotion, risk, and effort.
7. Add frontstage, backstage, systems, policies, and handoffs when relevant.
8. Choose the smallest useful metric set.
9. Map the target experience.
10. Convert decisions into product, service, content, analytics, and engineering
    tasks.
11. Validate with mixed evidence before claiming improvement.

### Create A New Flow

1. Define user and goal.
2. Define the success result.
3. List necessary data.
4. Remove data that is not needed now.
5. Map the happy path.
6. Map edge cases.
7. Map errors and recovery.
8. Define screen states.
9. Write primary microcopy.
10. Define events and metrics.
11. Convert into routes, components, state, and tests.
12. Validate with at least heuristic review and, when possible, users.

### Improve An Existing Flow

1. Describe the current flow.
2. Identify where the user stops, makes errors, or hesitates.
3. Classify friction by impact.
4. Fix blockers and errors first.
5. Reduce doubt and anxiety next.
6. Optimize speed after clarity and recovery are handled.
7. Compare metrics or evidence before and after.
8. Document trade-offs.

### Review A Form

1. Ask whether every field is necessary at this moment.
2. Group related fields.
3. Use persistent labels, not placeholders as labels.
4. Show formats and constraints before the user fails.
5. Validate at the right time, neither too early nor too late.
6. Write errors as problem plus fix.
7. Preserve user-entered data.
8. Use mobile-appropriate input types.
9. Allow review before critical submission.
10. Test keyboard, basic assistive tech behavior, and error states.

### Review Onboarding

1. Define the first real value.
2. Remove explanations that do not help reach it.
3. Avoid long generic tours.
4. Use contextual guidance.
5. Provide example data, templates, or demos when useful.
6. Show progress only when steps matter.
7. Separate beginner and advanced-user paths.
8. Measure time to value, activation, and abandonment.

### Create Interface States

For each state, answer:

- What is happening? What can the user do now? What is the system doing? What
  went wrong, if anything? How can the user recover? How long should this take?
  Does the user need control, confirmation, or undo?

Minimum state set: default, loading, empty, error, success, disabled, partial
failure, permission denied, offline, no results, first use, and returning user.

### Improve Microcopy

1. Use a real action verb.
2. Use the user's vocabulary.
3. Avoid internal jargon.
4. Say what happens after click or submit.
5. In errors, state the problem and the fix.
6. In empty states, explain why it is empty and what to do next.
7. In loading states, explain what is happening when the wait may create doubt.
8. In confirmation states, explain the consequence.
9. For destructive actions, prefer undo when feasible.
10. Remove text that does not reduce doubt.

## Required Heuristics

Use Nielsen's 10 usability heuristics as review prompts:

1. Visibility of system status.
2. Match between system and the real world.
3. User control and freedom.
4. Consistency and standards.
5. Error prevention.
6. Recognition rather than recall.
7. Flexibility and efficiency.
8. Aesthetic and minimalist design.
9. Help users recognize, diagnose, and recover from errors.
10. Help and documentation.

## Reference Navigation

- Read [references/README.md](./references/README.md) for a compact map of the
  reference files. Read
  [experience-map-playbook.md](./references/experience-map-playbook.md) when
  mapping desired end-to-end experiences, customer journeys, touchpoints, or
  service blueprints. Read [ux-flow-playbook.md](./references/ux-flow-playbook.md)
  when mapping or fixing product flows. Read
  [ux-state-patterns.md](./references/ux-state-patterns.md) when designing
  loading, empty, error, success, disabled, permission, offline, first-use, or
  returning-user states. Read
  [ux-validation-metrics.md](./references/ux-validation-metrics.md) when
  choosing tests or metrics. Read
  [web-interface-audit.md](./references/web-interface-audit.md) when reviewing
  semantic HTML, focus, forms, animation, content handling, images, navigation
  state, touch behavior, i18n, hydration safety, or web UI anti-patterns in
  code. Read [sources.md](./references/sources.md) when source-backed UX,
  accessibility, service design, or usability guidance is needed. Read
  [gotchas.md](./gotchas.md) before broad flow redesigns, conversion
  experiments, destructive-action flows, or claims that UX improved.

## Final Response Shape

When closing UX work, report:

1. User goal.
2. Flow or state analyzed.
3. Main friction found.
4. Improvements proposed or implemented.
5. How each improvement reduces effort, doubt, or risk.
6. States covered.
7. Relevant microcopy.
8. Tests or metrics recommended.
9. Trade-offs.
10. Next steps, if any.
