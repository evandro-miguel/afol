# Specifications

This folder contains all specifications for the project.

## Purpose

Specifications define **what** the system should do, without prescribing **how**.

## Structure

```text
specs/
├── <domain>/
│   ├── README.md          # Overview of domain specs
│   ├── functional.md      # Functional requirements
│   ├── non-functional.md  # NFRs (performance, security, etc.)
│   └── api.md             # API specifications
└── README.md              # This file
```

## Spec types

### Functional specifications

- User stories
- Use cases
- Business rules
- Data requirements

### Non-functional specifications

- Performance requirements
- Security requirements
- Scalability requirements
- Compliance requirements

### API specifications

- Endpoints
- Request/response schemas
- Authentication
- Rate limits

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

### Overview

- <brief description>

### Requirements

- REQ-001: <requirement>
- REQ-002: <requirement>

### Acceptance Criteria

- [ ] <criterion>

### Dependencies

- <related specs or systems>

### Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | YYYY-MM-DD | <author> | Initial |
```

## Status workflow

```text
draft → review → approved → deprecated
```

## Linking to work

Plans should reference spec IDs:

```markdown
## Objective

- Implement SPEC-AUTH-001: OAuth2 authentication
```

---

*Specifications folder: `.agents/a-docs/specs/`*
