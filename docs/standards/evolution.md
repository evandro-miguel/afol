---
doc_type: standard
id: "000000_000000_evolution-standard_standard_01"
status: active
created_at: 2026-02-23T00:00:00Z
updated_at: 2026-05-28T18:29:58Z
title: "Standard Evolution Policy"
---

## Standard Evolution Policy

This document defines how the agent system standards evolve over time.

### Update Process

#### When to Update Standards

1. **Bug fixes** - Immediately when inconsistencies are found
2. **New templates** - When a new document type is needed
3. **Process changes** - When workflow needs adjustment
4. **User feedback** - After any user correction

#### Update Steps

1. Update the source of truth (templates/standards)
2. Run sync script: `python .agents/scripts/sync-agent-docs.py`
3. Verify all agent files are updated
4. Add lesson if change was triggered by user correction

### Compatibility Policy

#### Backward Compatibility

- Existing documents remain valid
- Tools must accept legacy field names during transition
- Migration warnings should be helpful, not blocking

#### Legacy Field Mapping

| Legacy | Canonical | Status |
|--------|-----------|--------|
| `type` | `doc_type` | Accept with warning |
| `created` | `created_at` | Accept with warning |
| `updated` | `updated_at` | Accept with warning |
| `topic` | `theme` | Accept with warning |
| `spec_lite` | `spec-lite` | Accept with warning |
| `spec-lite` | `spec-child` | Compatibility alias only; new content should use `spec-child` |

#### Transition Period

- **Warning period**: 30 days after new standard is introduced
- **Hard deprecation**: After transition period, tools may reject legacy fields

### Deprecation Process

#### When to Deprecate

1. Feature not used in 3+ months
2. Better alternative exists
3. Security concern
4. Maintenance burden outweighs value

#### Deprecation Steps

1. Mark as `deprecated` in frontmatter status
2. Add deprecation notice to document
3. Keep document for 30 days
4. Move to `.agents/z-arq/` archive folder
5. Update any references

### Versioning

Standards do not use explicit version numbers. Instead:

- **ID timestamp** - Each document has creation date in ID
- **Frontmatter dates** - `created_at` and `updated_at` track history
- **Archive folder** - Old versions preserved in `.agents/z-arq/`

### Archive Process

Before deleting any file:

1. Move to `.agents/z-arq/YYYYMMDD_<description>/`
2. Include README explaining why it was archived
3. Update any references in remaining documents

---

*Standard: `docs/standards/evolution.md`*
