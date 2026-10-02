# Pull request

## Problem and scope

<!-- What user-visible or engineering problem does this solve? -->

## Architecture and security impact

<!-- Boundaries, invariants, dependencies, permissions, or
threat-model changes. -->

## Validation and evidence

<!-- Exact commands and observed outcomes. -->

- [ ] This short-lived branch starts from `main` and this PR targets `main`.
- [ ] Required local checks were run; hosted green is not release
      authorization.

## Documentation and rollback

<!-- Docs changed, known limits, and a practical rollback. -->

## Checklist

- [ ] Tests cover changed behavior.
- [ ] Hosted `quality`, `tests`, and `core-smoke` checks pass.
- [ ] Generated files are synchronized.
- [ ] No private paths, credentials, raw sessions, or unrelated state were added.
- [ ] New commands declare stability and side effects.
- [ ] Runtime dependencies are classified correctly.
- [ ] Security and release changes include Gitleaks and OSV evidence.
- [ ] This source-only alpha change does not add a standalone binary or package
      release path.
- [ ] Any Codex/Antigravity integration change keeps root `AGENTS.md` canonical
      and limits the optional adapter to `.agents/rules/afol.md`.
- [ ] Release-affecting changes include local exact-SHA `validate:release`
      evidence.
