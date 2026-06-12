---
doc_type: adr
id: ADR-003
title: JSON Operational State and Markdown Projection
status: superseded
created_at: '2026-06-12T12:12:33-03:00'
updated_at: '2026-06-12T13:37:19-03:00'
decision_type: architecture
supersedes: ""
superseded_by: ADR-004
affected_specs:
- docs/arc/SPECS/260521_0040_governance-workbench-system_spec_01.md
- docs/arc/SPECS/260521_0050_smart-rules-and-skills-routing_spec_01.md
- docs/arc/SPECS/260521_0060_file-first-low-token-execution_spec_01.md
- docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md
- docs/arc/SPECS/260612_agent-operational-state-context-library_spec_01.md
affected_rules: []
affected_skills: []
affected_commands:
- afol new
- afol start
- afol evidence
- afol done
- afol close
- afol local-state
archive_reason: ""
---

# ADR-003: JSON Operational State and Markdown Projection

## Context

AFOL has retired legacy active command surfaces and uses `afol` as the sole
public entrypoint. The current roadmap already requires structured workbench
state, compact routing, file-first handoffs, and rebuildable local indexes.

Markdown remains useful for human review, but it is weak as an operational data
model for scripts and agents. Long Markdown files increase token cost, make
state drift harder to detect, and encourage manual edits to sections that should
be command-owned.

## Decision

Use JSON/JSONL as the operational source of truth for AFOL agent workflows, and
use Markdown as a controlled human projection and audit surface.

Operational state belongs under `.afol/**`:

- session state under `.afol/wb/<session>/json/`,
- evidence and events as append-friendly structured records,
- failed AFOL command diagnostics as bounded command-error JSONL records,
- rebuildable indexes under `.afol/data/index/`,
- global sourced project research under `.afol/library/`.

Markdown workbench files remain readable projections. Managed blocks are
rendered by AFOL commands and can be validated for drift. Human notes outside
managed blocks can be preserved.

## Options Considered

1. Keep Markdown as the operational source.

- Pros: minimal migration, readable by default.
- Cons: fragile parsing, high token load, weak drift detection, and more manual
  edit ambiguity.
- Risks: agents continue to load and edit broad files for narrow state changes.

2. Move all state into a database.

- Pros: strong query model and fewer file parsing concerns.
- Cons: heavier runtime, harder downstream portability, more failure modes.
- Risks: overbuilds the MVP and weakens the file-first AFOL model.

3. Use JSON/JSONL operational state with Markdown projection.

- Pros: file-first, scriptable, reviewable, low-token, and compatible with
  rebuildable indexes.
- Cons: requires schemas, render/sync logic, and drift validation.
- Risks: dual surfaces can drift until managed rendering is enforced.

## Rationale

JSON/JSONL operational state with Markdown projection best matches AFOL's
current architecture: Bun/TypeScript CLI, local files, no hidden remote state,
rebuildable indexes, and compact agent handoffs. It also preserves human
auditing without treating prose as the final data model.

## Consequences

Positive:

- Agents can load narrow structured bundles instead of whole Markdown files.
- Drift between operational state and human projection becomes detectable.
- Session state, indexes, research, and compatibility checks can be validated
  with schemas and command tests.
- AFOL failures remain inspectable after the terminal output is gone, which
  makes repeated command bugs easier to reproduce and fix.
- The `.afol/**` mutable-state boundary remains explicit.

Negative:

- Existing Markdown-first lifecycle code needs staged migration.
- New schemas and render paths increase implementation surface.
- Old sessions may need explicit initialization or migration before strict JSON
  validation applies.

## Verification

- F-18 child specs define command, schema, lifecycle, routing, index, library,
  and spec-gate tests.
- Failure-path tests must prove AFOL records command-error diagnostics for
  parse, execution, validation, and closure failures.
- Each slice must run `bun run typecheck`, `bun test`, and
  `afol validate project --json`.
- Release claims still require the broader release validation path.

## Status

superseded by ADR-004
