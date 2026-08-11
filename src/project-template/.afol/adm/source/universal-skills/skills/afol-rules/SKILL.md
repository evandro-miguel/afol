---
name: afol-rules
description: Use when creating, updating, reviewing, or pruning AFOL rules under `.afol/adm/rules/**`, especially after user corrections, hook-context changes, token-budget issues, lifecycle guidance drift, or contradictions between rules and live AFOL behavior.
metadata:
  category: agentic
  tags: "afol, rules, governance, hooks, context-budget, lifecycle, token-economy"
  triggers: "afol rules, create rule, update rule, rule drift, stale rule, rule budget, hook context, lifecycle rule, .afol/adm/rules"
  references: "rules, hooks, governance, token-economy"
  version: "1.1.0"
  updated_at: "2026-08-10T00:00:00Z"
  target_provider: universal
  tier: 1
---

# AFOL Rules

Use this skill to author AFOL rules that are short, current, and enforceable.

## Contract

- Rules live in `.afol/adm/rules/**`, not `.agents/rules/**`.
- YAML frontmatter is metadata only. Prompt injection, hash, and budget use only
  the Markdown body after frontmatter.
- Keep rule bodies under `max_chars_per_rule`, normally 2,000 characters.

## Before Writing

- Read `AGENTS.md` and `.afol/config.json`; read `.agents/config.json`
  only when the canonical config is absent, as legacy fallback, then read
  nearby rules.
- Search by surface, trigger, noun, and failure mode.
- Prefer editing, splitting, deleting, or deprecating stale rules before adding
  a new one.
- Verify live AFOL behavior from code, tests, or compact commands.
- Create a rule only for durable operational contracts. Use docs, specs, ADRs,
  tests, hooks, or skills when those are the real source of truth.
- When the change follows a user correction, add exactly one English lesson
  entry under `docs/lessons/entries/` with the correction and prevention rule.

## Rule Shape

- State trigger, required behavior, and validation.
- Add forbidden behavior only for a known failure.
- Avoid rationale, long examples, and duplicate guidance.
- If the rule is near the limit, split or simplify it.

## Drift Check

Reject or fix rules that conflict with:

- live AFOL commands or tests;
- retired `.agents` runtime surfaces;
- lifecycle through State Board plus `afol start/evidence/done/close`;
- the ban on parallel `T-xx` checkbox lifecycle rows;
- token-budget, hook, or skill-path contracts;
- project-local skills under `.agents/skills/**`, not `.afol/skills/**`.

Fix related drift in the same change. Report unrelated drift.

## Hooks And Validation

- Hooks in `.afol/adm/hooks/**` are static context metadata only.
- Select injected rules through hook metadata; do not execute scripts or mutate
  state from hooks.
- For rule/hook/budget/template changes, run the smallest relevant check:

```bash
afol v project
afol s
bun test cli/tests/rule-command.test.ts cli/tests/context-system.test.ts
bun run kernel -- ck
bun run cli/dev/generate-template.ts
```
