# Agentic Runtime

Central runtime and FastMCP adapter for the agentic scaffold repository.

## Commands

```bash
uv sync
uv run agentic manifest
uv run agentic-mcp manifest
uv run agentic-mcp validate
uv run fastmcp run
```

## What it adds

- Compact workspace inspection
- Fuzzy document search
- Safe scaffold validation with optional repair
- Repository manifest generation
- Safe archive / write / patch / undo operations
- MCP resources for manifest, validation snapshot, and tool catalog
- Automatic exposure of `.agents/skills/` through FastMCP SkillsDirectoryProvider
