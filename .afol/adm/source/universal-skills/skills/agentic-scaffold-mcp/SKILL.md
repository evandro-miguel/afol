---
name: agentic-scaffold-mcp
description: Retired compatibility mirror for this AFOL-only repository.
---

# Agentic Scaffold MCP

This project no longer exposes a project-local scaffold MCP runtime as a public
entrypoint. Use AFOL CLI commands for scaffold inspection and lifecycle work.

```bash
afol status
afol validate project --json
afol verify-tasks --strict
afol update check
```

Keep `.afol/adm/source/` as static metadata only. New runtime behavior belongs in
the TypeScript AFOL implementation under `cli/**` and the downstream template
under `src/project-template/`.
