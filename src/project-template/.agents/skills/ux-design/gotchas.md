---
description: Use when a UX task risks opinion-only decisions, visual-first redesign, weak validation, dark patterns, inaccessible flows, or misleading metrics.
metadata:
  tags: "ux, gotchas, validation, accessibility, metrics, microcopy"
---

# UX Experience Gotchas

Use this file before broad UX redesign, onboarding work, form changes,
conversion experiments, destructive-action flows, or claims that experience
quality improved.

## Do Not Start With The Screen

Visual redesign is not the same as UX improvement.

Start with:

- User. Context. Task. Expected outcome. Risk of error. Current flow. Recovery
  paths. Evidence or assumption.

Only then decide what the interface should show.

## Avoid Internal Language

Users should not need to understand the product team's taxonomy.

Watch for:

- Database or API names in UI copy. Internal role names. Feature names used
  before users understand value. Error messages that describe implementation
  details. CTAs that name system actions instead of user outcomes.

Use the words users would use to describe the task.

## A Tooltip Is Often A Symptom

Tooltips can help with compact labels or secondary explanation, but they often
hide a deeper problem.

Before adding one, ask:

- Could the label be clearer? Could helper text be visible? Could the flow ask
  for this later? Could the component reveal the requirement in context? Is the
  tooltip accessible on keyboard and touch?

Do not use tooltip-only UX for critical information.

## Disabled Buttons Create Mystery

Disabled controls often remove feedback exactly when users need it.

Use disabled state only when:

- The missing requirement is obvious nearby. The disabled reason is textually
  explained. Keyboard and assistive tech behavior is acceptable. The user cannot
  safely trigger validation.

Otherwise, allow the action and respond with precise validation.

## Error Copy Must Preserve Trust

Weak error copy makes the user feel blamed or abandoned.

Good error copy says:

- What happened. Whether data is safe. What the user can do now. Whether retry,
  edit, support, or fallback exists.

Avoid:

- "Something went wrong" with no recovery. Raw status codes as the only message.
  Blaming the user without explaining the fix. Clearing user input after
  failure.

## Conversion Is Not Permission To Manipulate

Do not use dark patterns to improve metrics.

Avoid:

- Hidden opt-outs. Confirm-shaming. Scarcity claims without truth. Obscured
  destructive consequences. Forced onboarding that delays value. Ambiguous
  consent.

A conversion gain that reduces trust is not a UX win.

## Metrics Need Interpretation

Do not claim causality from a single metric.

Check:

- Sample size. Traffic source changes. User segment changes. Seasonality or
  campaign effects. Novelty effect. Qualitative evidence. Accessibility impact.

Pair analytics with observation when the decision matters.

## Accessibility Is Part Of UX

A flow is not complete if keyboard, screen reader, mobile, zoom, or reduced
motion paths fail.

Common misses:

- Focus lost after route or modal changes. Error messages not associated with
  fields. Progress hidden from assistive tech. Drag-only interactions. Touch
  targets too small. Color-only state communication.

Include accessibility paths in flow maps when the task is user-facing.

## Final Sanity Check

Before closing, ask:

- Does the user know where they are? Does the user know what to do next? Can the
  user recover from mistakes? Does the flow ask only for necessary information?
  Does the copy reduce doubt? Can the improvement be validated? Did trust
  increase rather than only conversion?
