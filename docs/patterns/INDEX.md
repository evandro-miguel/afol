---
doc_type: pattern_index
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-13T13:36:58-03:00'
---

# Pattern Catalog

## Purpose

Central catalog of patterns, anti-patterns, and best practices for .agents system usage.

## Pattern Types

| Type | Description | Location |
|------|-------------|----------|
| **Success** | Proven approaches that work well | `patterns/success/` |
| **Anti-Pattern** | Approaches to avoid | `patterns/anti/` |
| **Tool** | Tool effectiveness and usage patterns | `patterns/tools/` |
| **Template** | Template patterns for documents | `patterns/templates/` |

## Effectiveness Ratings

- **High**: Strong evidence of success, widely applicable
- **Medium**: Works in specific contexts, moderate evidence
- **Low**: Limited success, use with caution

## Patterns Index

### Success Patterns

| ID | Name | Tags | Effectiveness |
|----|------|------|---------------|
| PAT-001 | Discovery-First Tool Usage | process, tools | high |
| PAT-002 | Single Active Session | process, workbench | high |
| PAT-003 | Template-First Documentation | docs, process | high |

### Anti-Patterns

| ID | Name | Tags | Severity |
|----|------|------|----------|
| PAT-101 | Workbench Sprawl | process, workbench | high |
| PAT-102 | Manual Metadata Edits | docs, process | medium |
| PAT-103 | Large Unreviewed Diffs | process, quality | high |

### Tool Patterns

| ID | Tool | Rating | Notes |
|----|------|--------|-------|
| PAT-201 | `afol validate project` | high | Run before all work |
| PAT-202 | `afol new` | high | Use for all new workstreams |
| PAT-203 | `afol validate project` | high | Run before marking done |

### Template Patterns

| ID | Template | Use Case |
|----|----------|----------|
| PAT-301 | `plan.md` | Significant changes |
| PAT-302 | `task.md` | All workstreams |
| PAT-303 | `report.md` | Workstream completion |

## How to Use Patterns

### During Planning

1. Check pattern catalog for relevant patterns
2. Apply success patterns to your approach
3. Avoid anti-patterns in your plan

### During Execution

1. Reference patterns when making decisions
2. Record when you apply a pattern (telemetry)
3. Note if pattern was effective

### After Completion

1. Report pattern effectiveness in `report.md`
2. Suggest new patterns if you discover something
3. Update pattern evidence links

## Suggesting New Patterns

1. Create pattern file using `docs/templates/pattern.md`
2. Include evidence from actual sessions
3. Tag appropriately for discoverability
4. Set initial effectiveness to `medium` until proven

## Review Cycle

- **Weekly**: Review new patterns added
- **Monthly**: Update effectiveness ratings based on evidence
- **Quarterly**: Deprecate outdated patterns

## Related

- `docs/lessons/` - Detailed lessons learned
- `docs/telemetry/` - Telemetry data on pattern usage
- `.agents/rules/` - Operational rules

---

*Pattern Catalog: `docs/patterns/INDEX.md`*
