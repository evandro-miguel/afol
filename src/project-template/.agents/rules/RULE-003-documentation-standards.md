---
doc_type: rule
id: RULE-003
theme: documentation-standards
version: 1.0
created: 2026-02-23
applies_to: All agents (QWEN, CLAUDE, GEMINI)
updated_at: '2026-05-14T20:05:00-03:00'
---

# Documentation Standards

**Purpose:** Keep docs executable and minimal.

## Frontmatter (MANDATORY)

Every `.md` file needs YAML frontmatter.

```yaml
---
id: T-01
theme: auth-refactor
type: task
status: in_progress
owner: agent-name
created_at: 2026-02-23T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  plan: 260223_1800_auth-refactor_plan_01.md
  spec: 260223_1800_auth-refactor_spec_01.md
---
```

## Required Fields by Type

| Type | Required Fields |
| --- | --- |
| `plan` | id, theme, type, status, owner, created_at, updated_at |
| `task` | id, theme, type, status, owner, created_at, updated_at |
| `log` | id, theme, type, status, owner, created_at, updated_at |
| `spec` | id, theme, type, status, owner, created_at, updated_at |
| `report` | required fields above + files_changed |

## Status Values

```yaml
status: draft
status: active
status: review
status: approved
status: final
status: done
status: blocked
status: deprecated
status: superseded
```

## Timestamp Format

```yaml
created_at: 2026-02-23T10:00:00-03:00
updated_at: 2026-02-23T14:30:00-03:00
```

## Task Markers

```markdown
- [ ] T-01 # pending
- [/] T-02 # in_progress
- [%] T-03 # ready_for_test
- [!] T-04 # blocked
- [>] T-05 # skipped
- [x] T-06 # completed
```

## Local Minimalism Rule

- Keep local docs/rules as operational contracts.
- Keep commands, paths, IDs, markers, and gates.
- Remove long rationale and repeated explanations.
- Point to canonical docs/skills for deep context.

## Validation

```bash
./afol validate
./afol status
```
