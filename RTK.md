# RTK Policy

Use RTK selectively for high-output shell commands.

- Prefer `rg`, `fd`, focused reads, repo-analysis, Project RAG, and GitNexus
  CLI to locate targets before using RTK.
- Use `rtk git status`, `rtk find`, `rtk summary`, and bounded `rtk grep` for
  noisy follow-up output.
- For `rtk grep`, search a directory with `--glob`; avoid single-file
  colon-heavy grep when exact line structure matters.
- Keep raw `rg`, raw file reads, stack traces, final failure evidence, security
  evidence, migrations, and pre-commit diffs uncompressed.
- Stop using RTK for a path when it creates extra follow-up calls.
