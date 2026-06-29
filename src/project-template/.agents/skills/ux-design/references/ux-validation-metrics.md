---
description: Use when choosing UX validation methods, metrics, or interpretation rules for flows, navigation, forms, onboarding, errors, or usability improvements.
metadata:
  tags: "ux, validation, metrics, usability-testing, analytics, sus, umux-lite"
---

# UX Validation And Metrics

Validation should match the uncertainty. Use the smallest method that can prove
or disprove the UX risk.

## Qualitative Methods

### Moderated Usability Test

Use when the task is critical or behavior is uncertain.

Observe:

- Where the user hesitates. Where the user makes mistakes. Which words the user
  uses. What expectation the user had. Whether feedback is understood. Whether
  the user can recover from errors.

### Think-Aloud

Ask the user to narrate what they are thinking. This is useful for finding
confusion, but it can alter behavior. Treat it as a signal, not absolute truth.

### Five-Second Test

Use for landing pages, dashboards, and entry screens.

Ask after five seconds:

- What is this page? What is the main element? What would you do first?

### First-Click Test

Use for navigation and CTAs. Check whether the first click moves the user in the
right direction.

### Card Sorting

Use to organize categories around the user's mental model.

### Tree Testing

Use to validate information architecture without visual design influence.

## Quantitative Metrics

### Task Success Rate

Measures whether the user completed the task. Use for critical flows.

### Time On Task

Measures time effort. Interpret carefully: shorter is not always better when a
task requires consideration.

### Error Rate

Measures error frequency. Use for forms, checkout, configuration, and sensitive
flows.

### Drop-Off Rate

Measures where users abandon. Combine with qualitative review to understand why.

### Form Abandonment

Use to find fields or steps that cause friction.

### Activation Rate

Use for onboarding and SaaS products. Measures whether the user reached first
real value.

### Customer Effort Score

Use when the goal is reducing perceived effort.

### SUS And UMUX-Lite

Use for broad perceived usability. SUS is more established. UMUX-Lite is shorter
and measures perceived ease plus usefulness.

## Metric By Problem Type

| Problem | Useful metric |
| --- | --- |
| User does not understand the screen | Five-second test, qualitative notes. |
| User clicks the wrong target | First-click test, click analytics. |
| User abandons a flow | Drop-off, completion rate, session review. |
| Form creates friction | Form abandonment, error rate, time on task. |
| Onboarding fails | Activation rate, time to value, completion rate. |
| Errors are confusing | Recovery success, tickets, or testing. |
| Navigation is weak | Tree testing, search success, first-click test. |
| General usability feels poor | SUS, UMUX-Lite, Customer Effort Score. |

## Interpretation Rules

Do not confuse correlation with cause.

If a metric improves, ask:

- Is the sample size sufficient? Did traffic source change? Did user profile
  change? Could the metric improve through manipulation instead of better
  experience? Did qualitative observation also improve? Did accessibility or
  vulnerable-user experience regress? Was the improvement sustained after
  novelty faded?

## Validation Selection

| Situation | Minimum useful validation |
| --- | --- |
| Small copy or state improvement | Heuristic review plus focused QA. |
| Important navigation change | First-click or tree test. |
| Critical form change | Error rate, completion rate, and usability notes. |
| Onboarding change | Activation rate, time to value, and observation. |
| Landing page clarity | Five-second test and conversion sanity check. |
| Accessibility-sensitive flow | Keyboard, screen reader smoke, WCAG review. |
| High-risk destructive flow | Moderated or representative test first. |

## Reporting Results

Report:

1. Hypothesis.
2. Method.
3. Participants or data source.
4. Result.
5. Confidence level.
6. Decision.
7. Follow-up risk.

If validation could not be run, state what evidence is missing and which method
would close the gap.
