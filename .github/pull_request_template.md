# Pull request

## Problem and scope

<!-- What user-visible or engineering problem does this solve? -->

## Architecture and security impact

<!-- Boundaries, invariants, dependencies, permissions, or
threat-model changes. -->

## Validation and evidence

<!-- Exact commands and observed outcomes. -->

- [ ] This short-lived branch starts from `main` and this PR targets `main`.
- [ ] Local exact-SHA checks were run; this repository has no hosted CI
      workflow.

## Documentation and rollback

<!-- Docs changed, known limits, and a practical rollback. -->

## Checklist

- [ ] Tests cover changed behavior.
- [ ] Generated files are synchronized.
- [ ] No private paths, credentials, raw sessions, or unrelated state were added.
- [ ] New commands declare stability and side effects.
- [ ] Runtime dependencies are classified correctly.
- [ ] Security and release changes include Gitleaks and OSV evidence.
- [ ] This source-only alpha change does not add a standalone binary or package
      release path.
- [ ] Any Codex/Antigravity integration change keeps root `AGENTS.md` canonical
      and limits the optional adapter to `.agents/rules/afol.md`.
