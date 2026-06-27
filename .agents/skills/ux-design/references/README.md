---
description: Use as the navigation map for UX experience excellence references, including experience mapping, flow mapping, state patterns, validation metrics, sources, and gotchas.
metadata:
  tags: "ux, references, navigation, experience-mapping, flows, states, validation, sources"
---

# UX Design References

Use this file to choose the smallest reference that fits the UX task.

## When Mapping Desired Experience End To End

Read [experience-map-playbook.md](./experience-map-playbook.md) when the task
requires:

- Experience mapping. Customer journey mapping. Touchpoint mapping. Service
  blueprinting. Behavior evidence synthesis. Current-state and target-state
  comparison. Strategy decisions across product, service, content, analytics,
  research, and engineering.

Use this when the problem spans more than one screen, channel, actor, team, or
time period.

## When Mapping Or Fixing A Flow

Read [ux-flow-playbook.md](./ux-flow-playbook.md) when the task requires:

- Flow mapping. Journey review. Friction identification. Prioritization by
  impact. Recovery path design. Conversion of UX problems into frontend tasks.
  Flow review output.

This is the default reference for journey and task-completion work.

## When Designing Interface States

Read [ux-state-patterns.md](./ux-state-patterns.md) when the task involves:

- Loading states. Empty states. Error states. Success states. Disabled controls.
  Permission denied. No results. Offline or partial failure. First use.
  Returning user. Destructive actions.

Use it before writing state microcopy or adding state-specific components.

## When Validating UX

Read [ux-validation-metrics.md](./ux-validation-metrics.md) when choosing:

- Qualitative testing methods. Quantitative metrics. Success criteria.
  Before/after analytics. Usability score interpretation. Reporting format.

Use it before claiming the experience improved.

## When Auditing Web Interface Code

Read [web-interface-audit.md](./web-interface-audit.md) when reviewing:

- Semantic HTML. Focus states. Form labels and errors. Animation and reduced
  motion. Long content handling. Images and layout stability. Navigation state.
  Touch interaction. Safe areas. Dark mode and theming. Locale and i18n.
  Hydration safety. Web UI anti-patterns.

Use this for terse code findings with file and line references.

## When Validating With Sources

Read [sources.md](./sources.md) when the task needs:

- UX heuristic references. Service design references. Forms and accessibility
  references. Usability testing references. Metrics references. Cross-checks
  against established design systems.

When exact standard language matters, verify official source pages directly.

## When Risk Is High

Read [../gotchas.md](../gotchas.md) before:

- Broad redesigns. Onboarding changes. Form changes. Conversion experiments.
  Destructive-action flows. Permission or access flows. UX metric claims.
  Accessibility-sensitive flows.

## Reference Loading Rule

Do not load every reference by default. Start from `SKILL.md`, then load only
the file that answers the next decision.

Typical paths:

- Desired end-to-end experience: `SKILL.md` -> `experience-map-playbook.md`.
  New or existing product flow: `SKILL.md` -> `ux-flow-playbook.md`. State
  design or microcopy: `SKILL.md` -> `ux-state-patterns.md`. Validation plan:
  `SKILL.md` -> `ux-validation-metrics.md`. Source-backed proof: `SKILL.md` ->
  `sources.md`. Risky change: `SKILL.md` -> `gotchas.md` -> relevant reference.

## Companion Skills

- Use `ui-design` when the issue is visual hierarchy, component quality, layout,
  motion, frontend implementation, or searchable UI design data. Use `dogfood`
  or `qa-fix` when the work requires exploratory testing or a find-and-fix loop
  on a real app.
