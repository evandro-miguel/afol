---
doc_type: standard
id: 000000_000000_frontmatter-standard_standard_01
status: active
created_at: 2026-02-23 00:00:00+00:00
updated_at: '2026-04-04T10:08:11-03:00'
title: Frontmatter Standard
---

# Frontmatter Standard

This document defines the canonical frontmatter schema for all agent documentation files.

## Canonical Schema

All documents MUST include the following fields:

```yaml
---
doc_type: <document_type>
id: "YYMMDD_HHMM_<theme>_<document_type>_NN"
status: draft
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
title: "<short title>"
---
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `doc_type` | string | Document type (plan, task, report, log, brainstorm, explorer-check, research, postmortem, blocks, spec, spec-lite, adr, architecture, roadmap, retrospective) |
| `id` | string | Unique identifier in format `YYMMDD_HHMM_<theme>_<doc_type>_NN` |
| `status` | string | Current status (draft, active, done, blocked) |
| `created_at` | string | Creation timestamp in ISO 8601 UTC format |
| `updated_at` | string | Last update timestamp in ISO 8601 UTC format |

### Recommended Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Short descriptive title |
| `theme` | string | Theme or feature name |
| `owners` | array | List of owners |
| `links` | array | Related document links |
| `workstream_intent` | string | Governing session intent when the doc is materialized |
| `artifact_purpose` | string | Why the artifact deserves to exist in the session |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `repo` | string | Repository name |
| `branch` | string | Branch or worktree name |

## Document Types

### Workbench Types (wb)
- `plan` - Planning document
- `task` - Task checklist
- `log` - Execution log
- `report` - Execution report
- `brainstorm` - Options exploration
- `explorer-check` - Repo-context validation for a plan
- `research` - Research findings
- `postmortem` - Final session closure findings
- `blocks` - Blockers documentation
- `retrospective` - Retrospective notes

### Architecture Types (arc)
- `spec` - Full specification
- `spec-lite` - Lightweight specification
- `adr` - Architecture decision record
- `architecture` - Architecture documentation
- `roadmap` - Roadmap planning

### Meta Types (standards)
- `standard` - Standard documents
- `index` - Index documents

## Legacy Compatibility

The following legacy field names are accepted during the transition period:

| Legacy Field | Canonical Field |
|--------------|-----------------|
| `type` | `doc_type` |
| `created` | `created_at` |
| `updated` | `updated_at` |
| `topic` | `theme` |

Tools SHOULD warn when legacy fields are used and recommend migration to canonical fields.

---

*Standard: `docs/standards/frontmatter.md`*
