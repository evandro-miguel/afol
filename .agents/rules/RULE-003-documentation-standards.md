---
id: RULE-003
theme: documentation-standards
version: 1.0
created: 2026-02-23
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
updated_at: '2026-04-18T22:35:01-03:00'
---

# Documentation Standards

**Purpose:** Ensure consistent markdown documentation with proper frontmatter.

---

## Frontmatter (MANDATORY)

Project-authored managed Markdown files must have YAML frontmatter.

This applies to docs, rules, workbench artifacts, lessons, specs, reports, and
templates maintained by this scaffold.

This does not apply to vendored packages, dependency caches, third-party
licenses, generated build artifacts, or intentionally external Markdown copied
under cache/archive folders.

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

---

## Required Fields by Type

| Type | Required Fields |
|------|-----------------|
| `plan` | doc_type, id, theme, status, owners, created_at, updated_at |
| `task` | doc_type, id, theme, status, owners, created_at, updated_at |
| `log` | doc_type, id, theme, status, owners, created_at, updated_at |
| `spec` | doc_type, id, theme, status, owners, created_at, updated_at |
| `report` | doc_type, id, theme, status, owners, created_at, updated_at, links.files_changed |

---

## Status Values

```yaml
status: draft       # Initial state
status: active      # Currently working
status: review      # Ready for review
status: approved    # Approved
status: final       # Final version
status: done        # Completed
status: blocked     # Blocked by dependency
status: deprecated  # No longer recommended
status: superseded  # Replaced by newer version
```

**Set status:**

```bash
./.agents/agents wb-update status --value active --file plan
just wb-status STATUS=active
```

---

## Timestamp Format

**ISO 8601 with timezone offset:**

```yaml
created_at: 2026-02-23T10:00:00-03:00
updated_at: 2026-02-23T14:30:00-03:00
```

**Timezone offsets:**

- `-03:00` - Brazil/WSL (WB_OFFSET)
- `+00:00` - UTC (default)
- `Z` - UTC (alternative)

**Normalize timestamps:**

```bash
./.agents/agents wb-update normalize-time --all-wb
```

---

## Links Section

```yaml
links:
  plan: 260223_1800_auth-refactor_plan_01.md
  task: 260223_1800_auth-refactor_task_01.md
  spec: 260223_1800_auth-refactor_spec_01.md
  related:
    - 260220_1000_other-session_plan_01.md
  files_changed:
    - src/auth/login.ts
    - src/auth/validator.ts
```

**Set link:**

```bash
./.agents/agents wb-update link --file plan --key related --value "260220_1000_other"
```

---

## Task Markers

```markdown
- [ ] T-01 Description # pending
- [/] T-02 Description # in_progress
- [%] T-03 Description # ready_for_test
- [!] T-04 Description # blocked
- [>] T-05 Description # skipped
- [x] T-06 Description # completed
```

**Format rules:**

- Use lowercase `x` for completed: `- [x]`
- Use forward slash for in-progress: `- [/]`
- Use space for pending: `- [ ]`
- Always include task ID after marker

---

## Best Practices

**DO:**

- ✅ Include frontmatter in project-authored managed Markdown
- ✅ Use valid status values
- ✅ Include timezone in timestamps
- ✅ Update `updated_at` when editing
- ✅ Use consistent task marker format

**DON'T:**

- ❌ Skip frontmatter on managed project docs
- ❌ Treat vendored cache/license Markdown as project documentation
- ❌ Use invalid status values
- ❌ Use timestamps without timezone
- ❌ Mix marker formats (`- [X]` vs `- [x]`)
- ❌ Forget to update `updated_at`

---

## Validation

```bash
# Validate frontmatter
./.agents/agents lint-docs .agents/wb/

# Fix issues automatically
./.agents/agents lint-docs .agents/wb --fix
```

---

## References

- `docs/agentic/agents-lint-docs.md` - Linting docs
- `docs/standards/frontmatter.md` - Frontmatter standards
- RULE-004 - Validation & Linting

---

*Version: 1.0 | Lines: ~150 | Max: 250*
