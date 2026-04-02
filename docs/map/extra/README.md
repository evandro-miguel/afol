# Repository Map Raw Evidence

Generated with the docker-analisys-tools image.

## Targets

- .

## Output Index

- `metadata.json`: run metadata and target directories
- `tool-versions.txt`: versions used inside the container
- `bootstrap/`: host-generated repo profile, compressed snapshot, token distribution, and symbol inventory
- `phase1/`: dependency graph artifacts from Madge, dependency-cruiser, pydeps, and coupling summaries
- `phase2/`: structural extraction artifacts from ast-grep, plus stack-specific and entrypoint/config boundaries like Convex, TanStack, Zod, SQLite, CLI, and MCP
- `phase3/`: Semgrep CE findings plus stack-aware custom patterns
- `phase4/`: CodeCharta map, derived hotspots, git churn export, temporal coupling, and worktree diff evidence
- `changelogs/`: archived root changelog snapshots and prior symbol exports keyed by map version
- `logs/`: raw command logs for troubleshooting
