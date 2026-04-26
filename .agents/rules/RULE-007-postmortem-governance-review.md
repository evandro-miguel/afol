---
id: RULE-007
theme: postmortem-governance-review
version: 1.0
created: 2026-04-23
updated_at: '2026-04-23T14:38:16-03:00'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Postmortem Governance Review

**Purpose:** Force final postmortems to decide whether the session should
promote a reusable lesson, rule, ADR/decision, or skill/doc follow-up.

---

## When This Rule Applies

Apply this rule whenever a workstream creates a `postmortem` artifact and wants
to mark it `final`.

This rule complements:

- `RULE-002` for governed workstream creation and closure flow
- `RULE-004` for executable validation before completion
- `RULE-006` for rule/spec/skill resolution by touched element

---

## Required Review

Before a postmortem can be finalized, it must contain a completed
`## Governance Promotion Review` section with explicit answers for:

- whether a new lesson entry is needed
- whether a new or updated rule is needed
- whether an ADR or decision record is needed
- whether a skill or doc update is needed
- which evidence/artifacts were reviewed
- whether the follow-up was already recorded

Do not leave placeholders such as `<yes/no>` or `<artifact ids...>` in a final
postmortem.

---

## Promotion Heuristics

Use these defaults:

- **Lesson entry:** repeated operator correction, reusable failure mode, or a
  prevention rule worth remembering across sessions
- **Rule update:** the problem should become a mandatory behavior or executable
  gate instead of relying on memory
- **ADR/decision:** the session settled an architectural boundary, durable
  tradeoff, or hard-to-reverse policy choice
- **Skill/doc update:** future agents or operators need the new behavior in the
  local skill stack, command docs, or standards

If the answer is "no" for every promotion category, record that explicitly.

---

## Boundaries

- This rule does not require automatic creation of lesson, rule, or ADR files.
- This rule does require the postmortem to say whether those follow-ups are
  needed and whether they were recorded elsewhere in the workstream.
- If the session has no postmortem, this rule does not force creation of one.

---

## Validation

Before closure:

- `./.agents/agents wb-update status --session <session-id> --file postmortem --value final`
  must succeed without unresolved placeholders.
- `./.agents/agents verify-tasks --strict .agents/wb/<session-id>` must not
  report incomplete postmortem governance review.

---

## Best Practices

**DO:**

- ✅ Base the promotion review on concrete session artifacts, not memory alone.
- ✅ Record "no" explicitly when a promotion target is not needed.
- ✅ Point to the exact evidence reviewed when the decision matters later.

**DON'T:**

- ❌ Finalize a postmortem with template placeholders still present.
- ❌ Treat reusable lessons/rules/decisions as optional chat-only commentary.
- ❌ Auto-generate governance artifacts without a reviewed decision path.

---

## References

- `docs/templates/postmortem.md`
- `RULE-002-workstream-creation.md`
- `RULE-004-validation-linting.md`
- `RULE-006-applicable-rule-resolution.md`

---

*Version: 1.0 | Lines: ~95 | Max: 250*
