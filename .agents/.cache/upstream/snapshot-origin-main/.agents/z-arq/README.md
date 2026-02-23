# Archive

This folder stores files and folders that have been deleted from the project.

## Purpose

Instead of permanently deleting files, move them here to:
- Maintain history of removed code
- Allow recovery if needed
- Track what was removed and why

## Naming convention

```
z-arq/YYYYMMDD_<description>/
  └── <original_file_or_folder>
```

Example:
```
z-arq/20260223_old_auth_module/
  └── src/auth/legacy.py
```

## Process

When deleting a file or folder:

1. Create archive folder: `mkdir z-arq/YYYYMMDD_<description>`
2. Move the file: `mv <path> z-arq/YYYYMMDD_<description>/`
3. Document in `.agents/a-docs/lessons/general-lessons.md` or a report
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
To restore: `mv z-arq/YYYYMMDD_<description>/<file> <original_path>`
```

## Retention policy

- Keep archived files for: <define your policy>
- Review archives quarterly
- Permanently delete only after confirmation

---
*Archive folder: `.agents/z-arq/`*
