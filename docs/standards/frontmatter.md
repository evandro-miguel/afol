---
doc_type: standard
id: 000000_000000_frontmatter-standard_standard_01
status: active
created_at: 2026-02-23 00:00:00+00:00
updated_at: '2026-05-28T18:29:58Z'
title: Frontmatter Standard
---

## Frontmatter Standard

This document defines the canonical frontmatter schema for all agent documentation files.

### Canonical Schema

All documents MUST include the following fields:

```yaml
---
doc_type: <document_type>
id: "YYMMDD_HHMM_<theme>_<document_type>_NN"
status: draft
created_at: "YYYY-MM-DDTHH:MM:SS.SSSZ"
updated_at: "YYYY-MM-DDTHH:MM:SS.SSSZ"
title: "<short title>"
---
```

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `doc_type` | string | Canonical document type listed below |
| `id` | string | Unique identifier in format `YYMMDD_HHMM_<theme>_<doc_type>_NN` |
| `status` | string | Current status (draft, active, done, blocked, closed) |
| `created_at` | string | Creation timestamp in canonical ISO 8601 UTC format |
| `updated_at` | string | Last update timestamp in canonical ISO 8601 UTC format |

#### Recommended Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Short descriptive title |
| `theme` | string | Theme or feature name |
| `owners` | array | List of owners |
| `links` | array | Related document links |
| `workstream_intent` | string | Governing session intent when the doc is materialized |
| `artifact_purpose` | string | Why the artifact deserves to exist in the session |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `repo` | string | Repository name |
| `branch` | string | Branch or worktree name |
| `closed_at` | string | Durable close timestamp for a closed workbench task |

#### Timestamp Contract

Readers MUST accept canonical UTC ISO 8601 timestamps with or without three-digit fractional seconds, such as `2026-07-09T22:06:33Z` and `2026-07-09T22:06:33.081Z`. Writers MUST emit the JavaScript `Date.toISOString()` form in UTC with milliseconds. Lifecycle writers MUST use the same emitted value for `closed_at` and `updated_at` when closing a session.

#### Workbench Close Invariant

The canonical task Markdown is the durable authority for session closure. A closed task document MUST use `doc_type: workbench_task`, `status: closed`, and canonical ISO 8601 UTC timestamps in `closed_at` and `updated_at`. The close writer MUST initially set both fields to the same value. A later supported metadata update MAY advance `updated_at`, but it MUST NOT make `updated_at` earlier than `closed_at`. An active task document MUST omit `closed_at`. Missing frontmatter remains a legacy open state until an explicit close prepends canonical metadata. Task rows that are all terminal mean ready to close. They do not prove that close was committed.

### Document Types

#### Canonical Workbench Lifecycle Types (wb)

- `workbench_plan` - AFOL-owned session plan projection
- `workbench_task` - AFOL-owned session task and lifecycle projection

| Legacy lifecycle input | Canonical emitted value |
|------------------------|-------------------------|
| `plan` | `workbench_plan` |
| `task` | `workbench_task` |

Lifecycle writers MUST emit the prefixed values. Readers MAY accept the unprefixed values only as legacy inputs. Writers MUST NOT emit those aliases.

#### Workflow Artifact Types

- `log` - Execution log
- `report` - Execution report
- `brainstorm` - Options exploration
- `explorer-check` - Repo-context validation for a plan
- `research` - Research findings
- `postmortem` - Final session closure findings
- `blocks` - Blockers documentation
- `retrospective` - Retrospective notes

#### Architecture Types (arc)

- `spec` - Full specification
- `spec-child` - Canonical child/local feature specification
- `spec-test` - Pre-test journey strategy specification
- `spec-lite` - Legacy alias for `spec-child`; not preferred for new work
- `adr` - Architecture decision record
- `architecture` - Architecture documentation
- `roadmap` - Roadmap planning

#### Meta Types (standards)

- `standard` - Standard documents
- `index` - Index documents

### Legacy Compatibility

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
