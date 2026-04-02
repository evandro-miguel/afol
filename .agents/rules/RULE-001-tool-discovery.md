---
id: RULE-001
theme: tool-discovery-usage
version: 1.0
created: 2026-02-23
applies_to: All agents (QWEN, CLAUDE, GEMINI)
---

# Tool Discovery & Usage

**Purpose:** Ensure agents discover and use .agents tools correctly.

---

## Mandatory First Step

**BEFORE any work, ALWAYS run:**

```bash
./.agents/agents tools list
```

---

## Tool Discovery Commands

| Command | Purpose |
|---------|---------|
| `.agents/agents tools list` | List all available tools |
| `.agents/agents tools list --type validation` | Filter by type |
| `.agents/agents tools search <keyword>` | Search by keyword |
| `.agents/agents tools info <tool-id>` | Get detailed info |
| `.agents/agents tools help` | Show help |

---

## Tool Categories

| Type | Tools | When to Use |
|------|-------|-------------|
| `validation` | `doctor`, `lint-docs` | Before commits |
| `creation` | `new` | Starting new work |
| `documentation` | `index`, `structure-map` | After creating specs |
| `verification` | `verify-tasks` | Before marking complete |
| `automation` | `wb-update` | Repetitive tasks |
| `synchronization` | `sync` | After AGENTS.md changes |
| `discovery` | `tools` | When unsure |

---

## Tool Usage Pattern

```
1. Discover → .agents/agents tools list
2. Learn    → .agents/agents tools info <tool-id>
3. Read     → docs/agentic/<tool>.md
4. Execute  → .agents/agents <command> [args]
5. Verify   → Check output and exit code
```

---

## Common Tools Quick Reference

### doctor (validation)
```bash
./.agents/agents doctor
make doctor
```
**When:** Before starting work, after structural changes

### new (creation)
```bash
./.agents/agents new <theme> --spec
make new THEME=<theme>
```
**When:** Starting new feature/bugfix

### verify-tasks (verification)
```bash
./.agents/agents verify-tasks .agents/wb/<session>/
make verify
```
**When:** Before marking workstream complete

### wb-update (automation)
```bash
./.agents/agents wb-update touch
./.agents/agents wb-update task T-01 --mark-done
./.agents/agents wb-update timeline --message "done"
```
**When:** Updating workbench metadata

### lint-docs (validation)
```bash
./.agents/agents lint-docs .agents/wb/
make lint
```
**When:** Before commits, after editing docs

---

## Makefile Quick Reference

```bash
make help              # Show all commands
make doctor            # Validate structure
make new THEME=x       # Create workstream
make verify            # Verify tasks complete
make lint              # Lint markdown docs
make all               # Full validation
make st                # structure (alias)
make dr                # doctor (alias)
```

---

## Best Practices

**DO:**
- ✅ Run `tools list` before starting work
- ✅ Use `tools info <tool>` to learn about tools
- ✅ Read `docs/agentic/<tool>.md` for details
- ✅ Run `make doctor` + `make lint` + `make verify` before commits

**DON'T:**
- ❌ Skip tool discovery
- ❌ Use tools without reading docs
- ❌ Commit without validation
- ❌ Use `doc` as alias (use `dr` for doctor)

---

## Troubleshooting

```bash
# Tool not found
python -m json.tool .agents/tools.json

# List available tools
./.agents/agents tools list

# Check wrapper
./.agents/agents help
```

---

## References

- `docs/agentic/agents-tools.md` - Tool discovery docs
- `docs/agentic/tools-json.md` - tools.json structure
- `.agents/tools.json` - Tool catalog

---

*Version: 1.0 | Lines: ~150 | Max: 250*
