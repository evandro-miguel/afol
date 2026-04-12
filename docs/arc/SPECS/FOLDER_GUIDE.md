---
doc_type: spec
id: 260412_0000_specs-folder-guide_spec_01
status: active
created_at: '2026-04-12T00:00:00Z'
updated_at: '2026-04-12T14:16:32-03:00'
title: Specifications Folder Guide
---

# Specifications

This folder contains the strategic feature specifications for the project.

## Purpose

Specifications define feature intent before execution starts.
They explain what a feature means, why it exists, who it serves, what journey it creates, and what acceptance looks like.
They should not be code-heavy implementation documents.

## Roadmap-First Rule

- Every meaningful roadmap feature must link to one parent spec.
- Large features must define child specs before implementation starts.
- Workstreams execute approved feature intent; they do not replace the parent spec.

## Spec Types

### Parent Specs

- One parent spec governs one roadmap feature.
- It captures philosophy, scope, user journey, constraints, and acceptance.

### Child Specs

- Child specs decompose large parent features into bounded objectives.
- They inherit the parent feature goal but narrow the delivery focus.

### Workstream Specs

- A local workstream `spec` or `spec-child` can refine delivery context.
- Keep `spec-lite` as a historical compatibility alias while migration remains in progress.
- Use `spec-test` when a feature needs a durable, journey-first testing strategy artifact.
- It never replaces the parent strategic spec in `docs/arc/SPECS/`.

## Required Content

A useful parent spec should answer:

- What problem does this feature solve?
- Who is the user or operator?
- What is the intended journey or behavioral outcome?
- What is in scope and out of scope?
- When are child specs required?
- What counts as acceptance?

## Template

```markdown
---
doc_type: spec
id: "SPEC-<domain>-<number>"
title: "<spec title>"
status: draft | review | approved | deprecated
version: "1.0.0"
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---

## Specification: <title>

### Feature Intent

- <what changes>

### Users and User Journey

- <who and what experience changes>

### Scope

- <in scope>
- <out of scope>

### Child Spec Strategy

- <when decomposition is required>

### Acceptance

- [ ] <criterion>
```

## Status Workflow

```text
draft -> active -> final -> deprecated
```

## Linking to Work

- Roadmap features must reference parent specs.
- Workstream plans, tasks, logs, and reports must carry `roadmap_feature` and `parent_spec`.
- Child specs should reference the parent spec in frontmatter.

---

*Specifications folder: `docs/arc/SPECS/`*
