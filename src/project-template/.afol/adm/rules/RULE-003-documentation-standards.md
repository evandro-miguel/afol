---
doc_type: rule
id: RULE-003
theme: documentation-standards
version: 1.1
created: 2026-02-23
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
updated_at: '2026-06-20T00:00:00Z'
---

# Documentation Standards

**Purpose:** keep managed Markdown predictable, valid, and easy to validate.

## Frontmatter

Project-authored managed Markdown needs YAML frontmatter. This applies to docs,
rules, workbench artifacts, specs, reports, lessons, and templates.

Do not apply this to vendored packages, dependency caches, third-party
licenses, generated build artifacts, or external Markdown copied under
cache/archive folders.

Minimum fields depend on artifact type, but managed artifacts normally include:
`doc_type`, `id`, `theme`, `status`, `created_at`, and `updated_at`.

Rule frontmatter is metadata only. Rule budgets and prompt injection use only
the Markdown body after frontmatter.

## Values

- Use ISO 8601 timestamps with timezone, e.g. `2026-02-23T10:00:00-03:00` or
  UTC `Z`.
- Use explicit links for related plan/task/spec/report/files when an artifact
  depends on them.
- Use checklist markers only for ordinary non-lifecycle checklist items.
- In workbench task files, `T-xx` lifecycle state belongs in `State Board` rows
  and AFOL commands, not parallel `- [ ]` or `- [x]` checklist rows.
- Keep task IDs as `T-NN`.
- Update `updated_at` when changing managed docs.

## Validation

```bash
afol validate project
```

Use narrower docs or task validation when available. Do not hard-wrap prose just
to satisfy line-length lint unless the repo makes it blocking.

## References

- RULE-004 - Validation and Linting
- `.afol/adm/rules/README.md`
