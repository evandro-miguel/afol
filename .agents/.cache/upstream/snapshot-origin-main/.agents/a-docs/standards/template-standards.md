---
doc_type: standard
id: "000000_000000_template-standards_standard_01"
status: active
created_at: 2026-02-23T00:00:00Z
updated_at: 2026-02-23T00:00:00Z
title: "Template Quality Standards"
---

# Template Quality Standards

This document defines minimum quality criteria for all templates in the agent system.

## Frontmatter Requirements

All templates MUST include:

```yaml
---
doc_type: <type>
id: "YYMMDD_HHMM_<theme>_<type>_NN"
status: draft
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `doc_type` | string | Document type identifier |
| `id` | string | Unique identifier with timestamp |
| `status` | string | Current status |
| `created_at` | string | ISO 8601 UTC timestamp |
| `updated_at` | string | ISO 8601 UTC timestamp |

### Recommended Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Short descriptive title |
| `theme` | string | Theme or feature name |
| `owners` | array | List of owners |
| `links` | array | Related document links |

## Content Structure Requirements

### Required Sections

1. **Frontmatter** - YAML block at the top
2. **Title** - Clear heading (H1 or H2)
3. **Body** - Structured content with logical sections
4. **Footer** - Template reference comment

### Content Guidelines

- Use consistent heading hierarchy (H1 → H2 → H3)
- Include placeholder markers `<placeholder>` for customizable content
- Provide examples where helpful
- Keep sections focused and modular

## Naming Conventions

### File Names

- Use lowercase with hyphens: `template-name.md`
- Include `_template` suffix only if referenced as such

### ID Format

```
YYMMDD_HHMM_<theme>_<doc_type>_NN
```

Example: `260223_1430_auth-refactor_task_01`

## Checklist for New Templates

Before creating a new template, verify:

- [ ] Frontmatter follows canonical schema
- [ ] All required fields are present
- [ ] Placeholders are clearly marked
- [ ] Examples are provided
- [ ] Template is placed in correct directory (templates/ or standards/)
- [ ] ID uses correct format
- [ ] Footer references correct template path

## Template Categories

### Workbench Templates (wb)
Location: `.agents/a-docs/templates/`
- plan.md
- task.md
- log.md
- report.md
- brainstorm.md
- research.md
- blocks.md
- retrospective.md

### Architecture Templates (arc)
Location: `.agents/a-docs/templates/`
- spec.md
- spec-lite.md
- adr.md
- architecture.md
- roadmap.md

### Standard Documents
Location: `.agents/a-docs/standards/`
- workflow.md
- verification.md
- frontmatter.md
- checkbox-protocol.md
- structure-map.md
- template-standards.md

---

*Standard: `.agents/a-docs/standards/template-standards.md`*
