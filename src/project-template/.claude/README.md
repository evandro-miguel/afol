# Claude Agent Configuration

## Skills

Skills are symlinked from `.agents/skills/` - the mandatory skills folder.

```text
.claude/skills -> ../.agents/skills
```

Do not store skills directly in this folder.

## Symlink Portability (Windows/Some Clones)

Some environments do not preserve symlinks correctly (for example, Git on Windows without symlink support).

If links break, run:

```bash
make fix-symlinks
```

Useful options:

```bash
# Preview only
make fix-symlinks DRY=1

# Force replacement of conflicting paths
make fix-symlinks FORCE=1

# Enforce copy fallback only (no symlink creation)
make fix-symlinks MODE=copy
```

This command repairs `.claude/skills` and `.claude/rules/default`.
When symlink creation is unavailable, it replicates content from `.agents/skills` and `.agents/rules`.

---

*Agent folder: `.claude/`*
