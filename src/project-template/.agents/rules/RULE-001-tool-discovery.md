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
./afol --help
./afol rule list
./afol skill list
```

## Tool Discovery Commands

| Command | Purpose |
| --- | --- |
| `./afol --help` | Show CLI command surface |
| `./afol rule list` | List local rules |
| `./afol rule show <rule-id>` | Show rule metadata |
| `./afol skill list` | List project skills |
| `./afol skill search <keyword>` | Find skill by keyword |
| `./afol validate` | Run scaffold validation |

## Tool Usage Pattern

```text
1) Discover: ./afol --help
2) Scope: ./afol rule list or ./afol skill list
3) Read: ./afol rule show <rule-id> or ./afol skill show <skill-name>
4) Execute: ./afol <command>
5) Verify: exit code + output
```

## Common Commands

```bash
./afol validate
./afol status
./afol n <theme> --feature-id F-01 --parent-spec <parent-spec-id>
./afol verify-tasks <configured-wb-dir>/<session>/
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
