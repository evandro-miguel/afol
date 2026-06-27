---
description: Use when auditing web interface code for semantic HTML, accessibility, focus, forms, animation, content handling, images, navigation state, touch behavior, i18n, hydration safety, and UI anti-patterns.
metadata:
  tags: "ux, web, accessibility, forms, focus, audit, semantic-html"
---

# Web Interface Audit

Use this checklist when reviewing UI files for concrete web-interface issues.
Read target files, compare against the rules below, and report findings with
clickable `file:line` references when possible.

## Semantics And Navigation

- Use real navigation links with `href`, not `onClick` navigation. Use `/` paths
  for navigation rather than hash-only routing unless the app is intentionally
  hash-routed. Prefer semantic HTML: `<button>`, `<a>`, `<input>`, `<label>`,
  `<dialog>`, headings, lists, and landmarks before ARIA. Keep headings
  hierarchical. Add skip link for main content on larger app surfaces. Use
  `scroll-margin-top` on heading anchors when fixed headers can cover them.
  Decorative icons should use `aria-hidden="true"`. Icon-only buttons need an
  accessible name. Async updates such as toasts and validation should use an
  appropriate live region.

## Focus States

- Interactive elements need visible focus. Do not use `outline: none` or
  `outline-none` without replacement focus style. Prefer `:focus-visible` so
  mouse clicks do not always show focus rings. Use `:focus-within` for compound
  controls when the group needs focus styling. Move focus intentionally after
  modal open, route changes, or validation failure.

## Forms

- Inputs need labels. Labels should be clickable via `htmlFor` or wrapping.
  Inputs should have meaningful `name`. Use correct `type` and `inputmode` for
  email, tel, URL, number, and codes. Use `autocomplete` intentionally. Do not
  block paste. Disable spellcheck on emails, codes, and usernames where
  appropriate. Checkboxes and radios should share a single hit target with their
  label. Keep submit enabled until request starts unless a disabled reason is
  visible. Show inline errors near fields. Focus the first error on submit when
  practical. Preserve user-entered data after errors. Warn before navigation
  when unsaved changes can be lost.

## Animation

- Honor `prefers-reduced-motion`. Animate transform and opacity where possible.
  Avoid `transition: all`; list properties explicitly. Set correct transform
  origin. Keep animations interruptible. Do not use animation to hide slow
  feedback or unclear state.

## Typography And Copy

- Use active voice. Use specific button labels: `Save API Key`, not `Continue`,
  when the action is specific. Error messages should include a fix or next step.
  Loading states should identify the operation when delay may create doubt. Use
  tabular numerals for columns and comparisons. Use `text-wrap: balance` or
  `text-wrap: pretty` on headings when supported.

## Content Handling

- Long content should truncate, clamp, or wrap intentionally. Flex children that
  should truncate usually need `min-width: 0`. Empty strings, empty arrays, and
  missing media should not render broken UI. User-generated content should
  handle short, average, and very long input.

## Images

- Informative images need alt text. Decorative images should use empty alt text.
  Images should include dimensions or otherwise reserve space to prevent layout
  shift. Lazy-load below-fold images. Prioritize or eagerly load critical
  above-fold images when the framework supports it.

## Performance

- Virtualize large lists when they can exceed practical render limits. Avoid
  layout reads in render. Batch DOM reads and writes. Keep controlled inputs
  cheap per keystroke. Preconnect to critical external asset domains. Use
  `font-display: swap` for web fonts when possible.

## State And Deep Links

- URL should reflect important state such as filters, tabs, pagination, and
  expanded panels when users need shareability or restoration. Destructive
  actions need confirmation, preview, undo, or clear consequence copy. Success,
  loading, empty, error, disabled, permission, and offline states should be
  represented in code, not only implied.

## Touch And Layout

- Touch targets should be large enough for mobile use. Use `touch-action`
  intentionally for interactive surfaces. Modals, drawers, and sheets should
  control overscroll. Full-bleed layouts should account for safe-area insets
  when relevant. Avoid unwanted horizontal scroll by fixing the overflowing
  content, not by hiding overflow globally as a first resort.

## Dark Mode And Theming

- Use `color-scheme` when native controls need to match dark mode. `meta
  theme-color` should match the page background on app-like surfaces. Native
  inputs need explicit background and text color in custom themes. Borders and
  glass surfaces must remain visible in light mode.

## Locale And Hydration

- Use `Intl.DateTimeFormat` for dates and times. Use `Intl.NumberFormat` for
  numbers and currency. Avoid hardcoded date, number, and currency formats.
  Guard date or time rendering that can mismatch between server and client. Use
  hydration suppression only where the mismatch is intentional.

## Anti-Patterns To Flag

- Disabling zoom with `user-scalable=no` or `maximum-scale=1`. `onPaste` with
  `preventDefault`. `transition: all`. `outline-none` without visible
  replacement. Clickable `div` or `span` instead of `button`. Icon buttons
  without `aria-label`. Images without dimensions when layout shift is likely.
  Form inputs without labels. Large arrays rendered without virtualization or
  pagination. Hardcoded date or number formats. `autoFocus` without a strong
  reason, especially on mobile.

## Output Format

Group by file and use concise findings:

```text
## src/Button.tsx

src/Button.tsx:42 - icon button missing accessible name
src/Button.tsx:67 - transition: all; list animated properties

## src/Modal.tsx

src/Modal.tsx:12 - drawer should control overscroll

## src/Card.tsx

pass
```

State issue and location. Add explanation only when the fix is not obvious.
