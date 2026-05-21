---
description: Standard template for workbench brainstorming documents.
metadata:
  tags: "template, brainstorm, options, decisions"
---

# Brainstorm Template

## Output Artifact Contract

- Sidecars: optional for this workflow.
- If produced, include explicit `sidecar_justification` as `required`.
- If not produced, set `sidecar_justification` to `not_required`.
- Produced sidecars must include a `Sidecar Justification` section with blocking
  question, decision produced, execution task affected, and stop condition.

```markdown
---
doc_type: brainstorm
id: "YYMMDD_HHMM_<theme>_brainstorm_01"
theme: "<theme_of_PRD>"
status: draft
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---

# Brainstorm: <theme_of_PRD>

## Problem Statement

- <what needs to be solved>

## Options

1. Option A - <summary>
2. Option B - <summary>
3. Option C - <summary>

## Tradeoffs

| Option | Pros | Cons | Risk |
|--------|------|------|------|
| A | <pros> | <cons> | <risk> |

## Preferred Direction

- Selected: <option>
- Why: <rationale>
```
