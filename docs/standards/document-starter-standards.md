---
doc_type: standard
id: 000000_000000_document-starter-standards_standard_01
status: superseded
superseded_by: docs/standards/frontmatter.md
created_at: 2026-02-23 00:00:00+00:00
updated_at: '2026-06-17T08:35:36-03:00'
title: Document Starter Standards
---

## Document Starter Standards

Reusable starters live in `docs/templates/`.
Keep them short and executable.

Historical note: this starter is retained for reference only. The canonical
frontmatter schema lives in `docs/standards/frontmatter.md`.

### Frontmatter Requirements

All reusable starters must include:

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

| Field | Type |
| --- | --- |
| `doc_type` | string |
| `id` | string |
| `status` | string |
| `created_at` | string |
| `updated_at` | string |

#### Recommended Fields

| Field | Type |
| --- | --- |
| `title` | string |
| `theme` | string |
| `owners` | array |
| `links` | array |
| `workstream_intent` | string |
| `artifact_purpose` | string |

### Content Structure Requirements

#### Required Sections

1. Frontmatter
2. Title
3. Body
4. Footer template reference (when used)

#### Content Guidelines

- Keep headings consistent.
- Keep placeholders explicit (`<placeholder>`).
- Keep one useful example when needed.
- Keep only operational instructions.

### Minimalism Rule

- Local starter text is contract, not essay.
- Keep commands, paths, IDs, placeholders, gates.
- Move deep rationale to canonical docs/skills.

### Naming Conventions

#### File Names

- lowercase + hyphens: `starter-name.md`
- location: `docs/templates/`

#### ID Format

```text
YYMMDD_HHMM_<theme>_<doc_type>_NN
```

Example: `260223_1430_auth-refactor_task_01`

### Checklist for New Starters

- [ ] Frontmatter follows schema
- [ ] Required fields present
- [ ] Placeholders clear
- [ ] Content is minimal and executable
- [ ] File is under `docs/templates/`
- [ ] ID format is correct

---

*Standard: `docs/standards/document-starter-standards.md`*
