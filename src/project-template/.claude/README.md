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
afol fix-symlinks
```

Useful options:

```bash
# Preview only
afol fix-symlinks --dry-run

# Force replacement of conflicting paths
afol fix-symlinks --force

# Enforce copy fallback only (no symlink creation)
afol fix-symlinks --mode copy
```

This command repairs `.claude/skills` and `.claude/rules/default`.
When symlink creation is unavailable, it replicates content from `.agents/skills` and `.agents/rules`.

---

*Agent folder: `.claude/`*
