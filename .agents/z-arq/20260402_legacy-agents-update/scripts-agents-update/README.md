# Agentic System Update System

Update system for the agentic system that allows repositories to pull updates from upstream without breaking local data.

## Features

- **Git-based updates**: Pull updates from upstream repository
- **Data preservation**: Never touches user data (wb/, arc/, lessons/)
- **Skeleton+delta backup**: Creates backup in z-arq/ with structure + modified files
- **Atomic swap**: Atomic version swap (Unix symlink, Windows rename)
- **Three-way merge**: Detects conflicts between local and upstream
- **Rollback**: Restores previous version from backup

## Commands

```bash
# Check for updates
./.agents/agents-update check

# See what will be modified
./.agents/agents-update plan
./.agents/agents-update plan --verbose  # Show unchanged files

# Apply update
./.agents/agents-update apply
./.agents/agents-update apply --dry-run  # Simulation
./.agents/agents-update apply --force    # No confirmation

# Rollback to previous version
./.agents/agents-update rollback
./.agents/agents-update rollback --to 1.0.0  # Specific version

# Diagnosis
./.agents/agents-update doctor
./.agents/agents-update doctor --fix  # Fix problems
```

## Architecture

### Components

1. **version.py**: SemVer parsing and comparison
2. **manifest.py**: Manifest with SHA-256 file hashes
3. **lock.py**: Concurrency control (lock file)
4. **ownership.py**: Ownership map (system/user/hybrid)
5. **upstream.py**: Fetch from upstream repository via git
6. **conflict.py**: Conflict detection (three-way merge)
7. **backup.py**: Skeleton + delta backup
8. **staging.py**: New version preparation
9. **swap.py**: Atomic swap (Unix symlink, Windows rename)
10. **agents-update.py**: Main CLI

### Update Flow

```text
1. Pre-flight (lock, permissions)
2. Download upstream → .cache/upstream/
3. Conflict detection (three-way)
4. Skeleton+delta backup → z-arq/
5. Staging → versions/v{X.Y.Z}/
6. Atomic swap
7. Post-flight validation
```

## File Ownership

| Category | Files | Update Behavior |
|----------|-------|-----------------|
| **system** | scripts/, tools.json, agents.config | Overwritten by upstream |
| **user** | wb/, arc/SPECS/, arc/DECISIONS/, lessons/ | Never modified |
| **hybrid** | agents.config, Makefile | Three-way merge |

## Backup Strategy

Backups are created in `.agents/z-arq/`:

```text
.agents/z-arq/
└── backup-20260223_1800_v1.0.0/
    ├── skeleton.txt    # List of all files
    ├── manifest.json   # Hashes before update
    └── delta/          # Modified files only
        ├── scripts/
        └── a-docs/
```

## Rollback

Rollback restores from backup:

```bash
# List available backups
./.agents/agents-update rollback --list

# Rollback to latest backup
./.agents/agents-update rollback

# Rollback to specific version
./.agents/agents-update rollback --to 1.0.0
```

## Troubleshooting

### Common Issues

**Lock file stuck:**

```bash
./.agents/agents-update doctor --fix
```

**Conflict detected:**

```bash
# Review conflicts
cat .agents/.update/conflicts.md

# Manual resolution, then:
./.agents/agents-update apply --continue
```

**Backup missing:**

```bash
# Cannot rollback without backup
# Re-run update with --force
```

## Related

- `.agents/agents.config` - Configuration
- `.agents/z-arq/` - Backup storage

---

*Document: `.agents/scripts/agents-update/README.md`*
