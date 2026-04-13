---
doc_type: standard
id: 000000_000000_document-starter-standards_standard_01
status: active
created_at: 2026-02-23 00:00:00+00:00
updated_at: '2026-04-13T13:37:56-03:00'
title: Document Starter Standards
---

## Document Starter Standards

This document defines minimum quality criteria for reusable document starters in the agent system.
Reusable starters must live under `docs/templates/`.

### Frontmatter Requirements

All reusable document starters MUST include:

```yaml
---
doc_type: <type>
id: "YYMMDD_HHMM_<theme>_<type>_NN"
status: draft
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---
```

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `doc_type` | string | Document type identifier |
| `id` | string | Unique identifier with timestamp |
| `status` | string | Current status |
| `created_at` | string | ISO 8601 UTC timestamp |
| `updated_at` | string | ISO 8601 UTC timestamp |

#### Recommended Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Short descriptive title |
| `theme` | string | Theme or feature name |
| `owners` | array | List of owners |
| `links` | array | Related document links |
| `workstream_intent` | string | Governing session intent when the doc is materialized |
| `artifact_purpose` | string | Why this artifact deserves to exist in the session |

### Content Structure Requirements

#### Required Sections

1. **Frontmatter** - YAML block at the top
2. **Title** - Clear heading (H1 or H2)
3. **Body** - Structured content with logical sections
4. **Footer** - Template reference comment

#### Content Guidelines

- Use consistent heading hierarchy (H1 → H2 → H3)
- Include placeholder markers `<placeholder>` for customizable content
- Provide examples where helpful
- Keep sections focused and modular

### Naming Conventions

#### File Names

- Use lowercase with hyphens: `starter-name.md`
- Place reusable starter files under `docs/templates/`

#### ID Format

```text
YYMMDD_HHMM_<theme>_<doc_type>_NN
```

Example: `260223_1430_auth-refactor_task_01`

### Checklist for New Starters

Before creating a new reusable starter, verify:

- [ ] Frontmatter follows canonical schema
- [ ] All required fields are present
- [ ] Placeholders are clearly marked
- [ ] Examples are provided
- [ ] Starter is placed under `docs/templates/`
- [ ] ID uses correct format
- [ ] Footer references correct `docs/templates/` path when a footer is used

### Starter Categories

#### Workbench Starters

Location: `docs/templates/`

- plan.md
- task.md
- log.md
- report.md
- brainstorm.md
- explorer-check.md
- research.md
- postmortem.md
- blocks.md
- retrospective.md

#### Architecture Starters

Location: `docs/templates/`

- spec.md
- spec-child.md
- spec-test.md
- spec-lite.md (legacy alias)
- adr.md
- architecture.md
- roadmap.md

#### Standard Documents

Location: `docs/standards/`

- workflow.md
- verification.md
- frontmatter.md
- checkbox-protocol.md
- structure-map.md
- document-starter-standards.md

---

*Standard: `docs/standards/document-starter-standards.md`*
