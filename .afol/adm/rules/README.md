---
doc_type: rule
id: readme
theme: rules
status: active
created_at: '2026-05-05T11:44:41+00:00'
updated_at: '2026-06-16T00:00:00Z'
---

# Rules

**Purpose:** static agent rules for this AFOL-only repository.

---

## Active Rules

| ID | Rule | Purpose |
|----|------|---------|
| RULE-002 | [workstream-creation](./RULE-002-workstream-creation.md) | Governed workstream creation and closure |
| RULE-003 | [documentation-standards](./RULE-003-documentation-standards.md) | Frontmatter and Markdown standards |
| RULE-004 | [validation-linting](./RULE-004-validation-linting.md) | Completion validation |
| RULE-005 | [folder-structure](./RULE-005-folder-structure.md) | AFOL-only folder ownership |
| RULE-006 | [applicable-rule-resolution](./RULE-006-applicable-rule-resolution.md) | Rule/spec/skill routing |
| RULE-007 | [postmortem-governance-review](./RULE-007-postmortem-governance-review.md) | Postmortem promotion review |
| RULE-009 | [legacy-surface-retirement](./RULE-009-legacy-surface-retirement.md) | Retirement gates for old surfaces |

---

## Quick Reference

```bash
# Inspect state
afol status

# Create governed execution
afol new <theme> --feature-id <feature-id> --parent-spec <spec-id>
afol start --session <session-id> --task-id T-01

# Record evidence and close
afol evidence --session <session-id> --task-id T-01 --command "<cmd>" --result passed
afol done --session <session-id> --task-id T-01
afol close --session <session-id>

# Validate
afol validate project --json
afol verify-tasks --strict
```

---

## Enforcement

- Use `afol` for supported scaffold, validation, workbench, update, evidence,
  and lifecycle operations.
- Treat YAML frontmatter as metadata only. Rule budgets and prompt injection use
  only the Markdown body after frontmatter; write enforceable guidance in the
  body and keep it compact.
- Keep `.agents/` limited to provider-facing metadata and project-local skills.
- Keep AFOL-owned hooks, rules, source seeds, and command catalogs under
  `.afol/adm/`.
- Keep mutable runtime state under `.afol/`.
- Do not add examples for retired entrypoints.

---

## References

| Location | Content |
|----------|---------|
| `AGENTS.md` | Repository-level AFOL policy |
| `.afol/adm/tools.json` | Static AFOL command catalog |
| `.afol/adm/rules/` | Static rule set |
| `.afol/adm/hooks/` | Static provider-neutral hook catalog |
| `.afol/adm/source/` | Static source seed metadata |
| `.agents/skills/` | Project-local provider skills |
