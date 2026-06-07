---
doc_type: rule
id: readme
theme: rules
status: active
created_at: '2026-05-05T11:50:54+00:00'
updated_at: '2026-05-05T11:50:54+00:00'
---

# Rules

Mandatory local rules for downstream bootstrap.

## Contract

- Keep local rules short and operational.
- Keep only commands, paths, states, and hard gates needed to execute.
- Do not copy long rationale from canonical docs/skills.
- Put deep rationale in `docs/standards/` or project skills and link to it.

## Structure

```text
.agents/rules/
├── README.md
├── RULE-001-tool-discovery.md
├── RULE-002-workstream-creation.md
├── RULE-003-documentation-standards.md
├── RULE-004-validation-linting.md
└── RULE-005-folder-structure.md
```

## Active Rules

| ID | Purpose |
| --- | --- |
| [RULE-001](./RULE-001-tool-discovery.md) | Discover and choose tools fast |
| [RULE-002](./RULE-002-workstream-creation.md) | Workstream/task flow |
| [RULE-003](./RULE-003-documentation-standards.md) | Frontmatter + markers |
| [RULE-004](./RULE-004-validation-linting.md) | Required validation gates |
| [RULE-005](./RULE-005-folder-structure.md) | Required scaffold paths |

## Quick Start

```bash
./afol --help
./afol rule list
./afol skill list
just doctor
just lint
just verify
```

## References

- `docs/standards/workflow.md`
- `docs/standards/verification.md`
- `docs/standards/document-starter-standards.md`
