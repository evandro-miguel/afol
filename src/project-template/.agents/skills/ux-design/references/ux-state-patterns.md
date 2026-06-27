---
description: Use when designing UX states such as loading, empty, error, success, disabled, permission denied, no results, offline, first use, or returning user.
metadata:
  tags: "ux, states, loading, empty-state, error-state, microcopy, recovery"
---

# UX State Patterns

Every state should explain what is happening, what the user can do, and how to
recover when something goes wrong.

## Loading

Answer:

- What is loading? Is the wait short or long? How much control does the user
  have? Can the layout be preserved with a skeleton? Is progress or a phase
  label needed? Can the user cancel, leave, or continue elsewhere?

Avoid generic spinners for long operations without context.

## Empty State

Answer:

- Why is it empty? Is this normal? What can the user do next? Is there an
  example, template, import path, or starter action? Should the state teach a
  first useful action?

Pattern:

```text
Title: Explain the state.
Text: Say why it happened.
Action: Provide a clear next step.
```

## Error State

Answer:

- What went wrong? Is it a user, system, network, or permission problem? Did the
  user lose data? How can they fix it or retry? Is there support, fallback, or a
  recovery path?

Good:

```text
We could not save your changes.
Your connection dropped, but your edits are still here. Try again.
```

Weak:

```text
Error 500.
```

## Success State

Answer:

- What was completed? What happens now? What useful next step exists? Does the
  user need proof, receipt, or confirmation detail?

Avoid invisible success for important actions.

## Disabled State

Answer:

- Why is the control disabled? What is missing before it can be used? Can
  validation explain the issue with the control enabled instead?

If disabled state creates mystery, prefer an enabled action with clear
validation and recovery copy.

## Permission Denied

Answer:

- What did the user try to do? Why are they blocked? Who can grant access? Is
  there an alternative action? Can they request access from here?

Do not expose internal permission names unless the user needs them.

## No Results

Answer:

- Was the search performed? Are filters active? How can the user clear filters?
  Are there alternate terms or categories? Is there a create/import action?

## Offline Or Partial Failure

Answer:

- What still works? What does not work? Were data saved locally? When or how
  will sync happen? What action can the user safely take now?

Partial failure should not make the whole interface feel broken if some work can
continue.

## First Use

Answer:

- What is this area for? Which first action creates value? Is there an example,
  template, import, or demo state? Can advanced users skip guidance?

Avoid long tours that block reaching first value.

## Returning User

Answer:

- What changed? Where can the user continue? Is there saved progress? Are there
  pending actions or alerts? Can the user quickly repeat common work?

## Destructive Action

Answer:

- What will be deleted, changed, or lost? Can the user preview the impact? Can
  the action be undone? Is confirmation copy specific enough? Is the safest
  action visually distinct?

Prefer undo when feasible. Use confirmation when the action is expensive,
irreversible, or security-sensitive.

## State Review Checklist

- [ ] The state has a clear title or status. [ ] The copy uses user language. [
  ] The next action is obvious. [ ] Recovery exists when possible. [ ] Data loss
  risk is explicit. [ ] The state is accessible by keyboard and assistive tech.
  [ ] Mobile layout still works. [ ] The state has a fixture, story, or test
  when important.
