---
id: TOOL-017
theme: agents-patterns
type: tool-doc
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-04-13T19:36:49-03:00'
links:
  tools_json: ./tools-json.md
  patterns_index: ../patterns/INDEX.md
  heat_scoring: ../telemetry/HEAT_SCORING.md
---

# agents-patterns.py - Pattern Catalog & Suggestions

## Why It Exists

**Problem:** Developers and agents need guidance on best practices. Without a pattern catalog:

- Same mistakes repeated
- Best practices not shared
- No tracking of what works

**Solution:** Centralized pattern catalog with automatic suggestions based on context.

## Function

Manages pattern catalog:

1. **Suggest** - Recommend patterns by theme/tags
2. **List** - List all patterns with filters
3. **Show** - Display pattern details
4. **Apply** - Apply pattern (records in telemetry)
5. **Rate** - Rate pattern effectiveness

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `docs/patterns/` | Pattern files |
| `docs/patterns/success/` | Success patterns |
| `docs/patterns/anti/` | Anti-patterns |
| `docs/patterns/tools/` | Tool patterns |
| `docs/patterns/templates/` | Template patterns |

### Files Written

| File | Purpose |
|------|---------|
| `docs/patterns/<type>/<id>.md` | Pattern files (manual) |
| Telemetry event | Pattern application (auto) |

## How to Configure

### agents.config

```yaml
patterns:
  enabled: true
  patterns_dir: "docs/patterns"
  auto_suggest: true
  min_effectiveness: "medium"
```

## How to Use

No public `afol patterns` verb exists yet. The commands below are factory-only
compatibility surfaces.

### Commands

```bash
# Suggest patterns
./.agents/agents patterns suggest --theme=auth-refactor
./.agents/agents patterns suggest --tags=process,tools --limit=5

# List patterns
./.agents/agents patterns list
./.agents/agents patterns list --type=success
./.agents/agents patterns list --status=active

# Show pattern
./.agents/agents patterns show PAT-001

# Apply pattern
./.agents/agents patterns apply PAT-001
./.agents/agents patterns apply PAT-001 --session=260223_1800_theme

# Rate pattern
./.agents/agents patterns rate PAT-001 --effectiveness=high
```

### Legacy compatibility only

```bash
# AFOL-native pattern verbs are pending.
# Keep wrapper usage factory-only until public verbs land.
```

## How to Modify

### Main Functions

```python
def suggest_patterns(theme, tags, limit):
    """Suggest patterns by theme/tags."""

def list_patterns(pattern_type, status):
    """List patterns with filters."""

def show_pattern(pattern_id):
    """Show pattern details."""

def apply_pattern(pattern_id, session_id):
    """Apply pattern and record in telemetry."""

def rate_pattern(pattern_id, effectiveness):
    """Update pattern effectiveness."""
```

### Add New Pattern

1. Copy `docs/templates/pattern.md`
2. Fill frontmatter (id, type, tags, effectiveness)
3. Write pattern content
4. Place in correct subdirectory
5. Update `patterns/INDEX.md`

## Pattern Types

| Type | Directory | Purpose |
|------|-----------|---------|
| success | `patterns/success/` | Proven approaches |
| anti | `patterns/anti/` | What to avoid |
| tool | `patterns/tools/` | Tool effectiveness |
| template | `patterns/templates/` | Template patterns |

## Pattern Structure

```markdown
---
id: PAT-NNN
type: success|anti|tool|template
status: active|deprecated
tags: [process, tools]
effectiveness: high|medium|low
---

# Pattern: Name

## Context

When does this apply?

## Pattern

What is the approach?

## Why It Works

Rationale and evidence.

## Examples

Good and bad examples.

## Evidence

Links to sessions/reports.
```

## Output Examples

### Suggest

```text
Suggested patterns for theme='auth-refactor':

ID         Type       Name                           Effectiveness   Tags
------------------------------------------------------------------------------------------
PAT-001    success    Discovery-First Tool Usage     high            process, tools
PAT-002    success    Single Active Session          high            process, workbench
```

### List

```text
ID         Type       Name                           Effectiveness   Tags
------------------------------------------------------------------------------------------
PAT-001    success    Discovery-First Tool Usage     high            process, tools
PAT-002    success    Single Active Session          high            process, workbench
PAT-101    anti       Workbench Sprawl               high            process, workbench
```

### Show

```text
============================================================
PATTERN: PAT-001
============================================================
Type: success
Status: active
Effectiveness: high
Tags: process, tools, discovery

CONTEXT
----------------------------------------
When starting work with the .agents system...

PATTERN
----------------------------------------
Always discover tools before using them...
```

## Heat Integration

Patterns are tracked in telemetry:

- `pattern_applied` event when applied
- Heat score calculated by period
- Effectiveness tracked over time

## Related

- [patterns/INDEX.md](../patterns/INDEX.md) - Pattern catalog
- [HEAT_SCORING.md](../telemetry/HEAT_SCORING.md) - Heat tracking
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-patterns.md`*
