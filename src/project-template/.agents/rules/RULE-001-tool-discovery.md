---
doc_type: rule
id: RULE-001
theme: tool-discovery-usage
version: 1.0
created: 2026-02-23
applies_to: All agents (QWEN, CLAUDE, GEMINI)
updated_at: '2026-05-14T20:05:00-03:00'
---

# Tool Discovery & Usage

**Purpose:** Discover tools first. Use smallest correct tool.

## Mandatory First Step

```bash
./.agents/agents tools list
```

## Tool Discovery Commands

| Command | Purpose |
| --- | --- |
| `./.agents/agents tools list` | List available tools |
| `./.agents/agents tools list --type validation` | Show validation tools |
| `./.agents/agents tools search <keyword>` | Find tool by keyword |
| `./.agents/agents tools info <tool-id>` | Show tool details |
| `./.agents/agents tools help` | Command help |

## Tool Usage Pattern

```text
1) Discover: tools list
2) Scope: tools info <tool-id>
3) Read: docs/agentic/<tool>.md
4) Execute: ./.agents/agents <command>
5) Verify: exit code + output
```

## Common Commands

```bash
./.agents/agents doctor
./.agents/agents new <theme> --feature-id F-01 --parent-spec <parent-spec-id>
./.agents/agents verify-tasks .agents/wb/<session>/
./.agents/agents wb-update touch
./.agents/agents lint-docs .agents/wb/
```

## Justfile Quick Reference

```bash
just help
just doctor
just new THEME=<theme>
just lint
just verify
just all
```

## Rule

- No blind tool use.
- No large discovery when focused commands can answer.
- Validate before closing work.
