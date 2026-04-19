---
id: RULE-004
theme: validation-linting
version: 1.0
created: 2026-02-23
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
updated_at: '2026-04-18T22:35:01-03:00'
---

# Validation & Linting

**Purpose:** Ensure code and documentation quality before commits.

---

## Completion Validation (MANDATORY)

Before marking work complete, run the validation required by the elements
touched. At minimum for scaffold changes:

```bash
# 1. Validate structure
just doctor

# 2. Lint documentation
just lint

# 3. Verify tasks/session state when a workstream is active
just verify
```

**OR full validation:**

```bash
just all
# Aggregate scaffold validation when available
```

---

## Validation Commands

### doctor (Structure Validation)

```bash
./.agents/agents doctor
just doctor
```

**Checks:**

- ✓ Required folders exist
- ✓ Templates are present
- ✓ Frontmatter YAML is valid
- ✓ IDs follow convention (YYMMDD_HHMM_theme_type_N)
- ✓ Timestamps in ISO 8601 with timezone
- ✓ Cross-links between documents are valid

**Exit codes:**

- `0` = All valid
- `1` = Errors found

---

### lint-docs (Markdown Linting)

```bash
# Lint specific folder
./.agents/agents lint-docs .agents/wb/

# Lint all docs
./.agents/agents lint-docs .agents/

# Auto-fix issues
./.agents/agents lint-docs .agents/wb --fix

# Via Justfile
just lint
```

**Checks:**

- ✓ Checkbox markers format (`- [X]`, `- [/]`, `- [ ]`)
- ✓ Status fields in frontmatter
- ✓ State values are valid
- ✓ Required frontmatter fields exist
- ✓ Cross-references are valid
- ✓ Task IDs follow T-NN pattern

---

### verify-tasks (Task Completion)

```bash
# Verify specific session
./.agents/agents verify-tasks .agents/wb/260223_1200_auth-refactor/

# Verify current directory
./.agents/agents verify-tasks .

# Via Justfile
just verify
```

**Exit codes:**

- `0` = All tasks complete
- `1` = Pending tasks found

---

## Fixing Issues

### Auto-fix (when possible)

```bash
./.agents/agents lint-docs .agents/wb --fix
```

### Manual fixes

| Issue | Fix |
|-------|-----|
| Invalid frontmatter | Add/correct YAML frontmatter |
| Wrong timestamp format | Use ISO 8601 with timezone |
| Invalid task marker | Use `- [x]`, `- [/]`, `- [ ]` |
| Missing task ID | Add T-NN format ID |
| Invalid status | Use valid status value |

### Normalize timestamps

```bash
./.agents/agents wb-update normalize-time --all-wb
```

---

## Validation Checklist

Before marking task complete:

- [ ] `just doctor` passes (all ✓)
- [ ] `just lint` passes (no issues)
- [ ] `just verify` passes when task/session state is in scope
- [ ] Relevant tests for touched code pass
- [ ] Frontmatter is valid
- [ ] Task markers are correct
- [ ] Timestamps have timezone

---

## Health Metrics

| Metric | Command | Healthy |
|--------|---------|---------|
| Structure valid | `just doctor` | All ✓ |
| Docs linted | `just lint` | No issues |
| Tasks complete | `just verify` | All [x] |
| Config valid | `python -m json.tool .agents/tools.json` | Valid JSON |

---

## Best Practices

**DO:**

- ✅ Run `just doctor` before starting work
- ✅ Run `just lint` after editing docs
- ✅ Run `just verify` before marking complete
- ✅ Fix issues immediately
- ✅ Use `--fix` when available

**DON'T:**

- ❌ Mark work complete without validation
- ❌ Ignore validation errors
- ❌ Skip `just verify` for workstreams
- ❌ Leave tasks in `[ ]` when done

---

## Troubleshooting

```bash
# Get detailed error
./.agents/agents doctor

# Fix lint issues
./.agents/agents lint-docs .agents/wb --fix

# Validate tools.json
python -m json.tool .agents/tools.json
```

---

## References

- `docs/agentic/agents-doctor.md` - doctor docs
- `docs/agentic/agents-lint-docs.md` - lint-docs docs
- `docs/agentic/verify-tasks.md` - verify-tasks docs
- RULE-003 - Documentation Standards

---

*Version: 1.0 | Lines: ~160 | Max: 250*
