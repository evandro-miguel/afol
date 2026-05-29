---
id: AGENT-001
theme: agentic-tools-documentation
type: index
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-04-13T14:00:00-03:00'
---

# Agentic Tools

This folder is the compact project-facing index for `.agents` runtime tools.

Use the runtime itself as the detailed source of truth:

```bash
./.agents/agents tools list
./.agents/agents tools info <tool-id>
./.agents/agents tools validate
```

Core surfaces:

- `.agents/agents`: CLI wrapper.
- `.agents/tools.json`: tool catalog.
- `.agents/config.json`: canonical project config seed.
- `.agents/agents.config`: legacy-compatible scaffold configuration.
- `.agents/scripts/`: command implementations.
- `.agents/runtime/`: runtime package and MCP adapter.
- `.agents/rules/`: mandatory operating rules.

Keep detailed project-specific tool notes here only when they add value beyond
the tool catalog.
