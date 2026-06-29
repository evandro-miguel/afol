---
doc_type: lesson_entry
id: lesson_20260629_1649_global-afol-install-must-be-real-binary
status: active
created_at: '2026-06-29T16:49:00-03:00'
updated_at: '2026-06-29T16:49:00-03:00'
source: user_correction
---

# Lesson: Global AFOL Install Must Be A Real Binary

## Correction

The user clarified that installing AFOL means installing the compiled CLI as a
global system command, not syncing a project worktree or changing a wrapper.
The development environment is separate: repo-local commands, local binaries,
or differently named project helpers are allowed when they are clearly used for
development or testing, not presented as the global install.

## Prevention Rule

Install AFOL to `$HOME/.local/bin/afol` as a regular executable binary. Do not
leave `afol` as a symlink, wrapper, or script pointing at `afol.dev`, `afol`,
or any other worktree. For development, use explicit local entrypoints such as
`./afol`, `bun run kernel`, `./dist/afol`, or a differently named helper so the
global `afol` command remains unambiguous.

## Required Check

After install, validate from outside the repository:

```bash
command -v afol
test ! -L "$(command -v afol)"
afol --version
afol --help >/dev/null
```
