# Archive

This folder stores finalized workbench sessions and other removed project
artifacts that may still be useful for recovery, lessons, or audit history.

## Purpose

Use this folder to preserve history when something is removed from the active
project surface. The retention policy lives in
[`docs/standards/Z_ARQ_RETENTION.md`](../../docs/standards/Z_ARQ_RETENTION.md).

Instead of permanently deleting files, move them here to:

- Maintain history of removed code
- Allow recovery if needed
- Track what was removed and why

## Naming convention

```text
z-arq/YYYYMMDD_<description>/
  └── <original_file_or_folder>
```

Example:

```text
z-arq/20260223_old_auth_module/
  └── src/auth/legacy.py
```

## Process

When deleting a file or folder:

1. Create archive folder: `mkdir .agents/z-arq/YYYYMMDD_<description>`
2. Move the file: `mv <path> .agents/z-arq/YYYYMMDD_<description>/`
3. Document the reason in a workbench report, lesson, or related governed doc
4. Optionally add a README explaining why it was archived

## Archive README template

```markdown
# Archived: <original_path>

## Date: YYYY-MM-DD

## Reason for archival

- <why this was removed>

## Replaced by

- <new implementation or N/A>

## Recovery

To restore: `mv .agents/z-arq/YYYYMMDD_<description>/<file> <original_path>`
```

## Retention policy

- Archived sessions stay in `.agents/z-arq/` until the retention policy says
  they can be reviewed for removal.
- Review archives before deletion so lessons, specs, or decisions can be
  preserved elsewhere.
- Keep active sessions in `.agents/wb/`; do not archive live work.
- If an archive payload is only scratch material, copy any useful evidence out
  first and only then delete the disposable remainder.

---

*Archive folder: `.agents/z-arq/`*
