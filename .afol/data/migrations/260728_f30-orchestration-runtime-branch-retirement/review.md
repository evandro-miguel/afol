# Branch retirement review: F-30 orchestration runtime

## Scope

- Remote branch: `origin/feat/f30-orchestration-runtime`
- Recorded tip: `dc9d1657d09a5ee3e254c0df441dbd8cb982f216`
- Merge base with `dev`: `9601d96decd7fc242bdc94130c8cf436738aafc9`
- Captured divergence: 82 commits behind and 2 commits ahead of `dev`
- Pull request: [#58](https://github.com/evandro-miguel/afol/pull/58),
  draft, closed, and not merged
- Classification: `branch-retirement-metadata`
- Authority: historical reference only

## Decision

Do not merge or cherry-pick the branch. Retire the remote branch after this
metadata is committed and published to `dev`, provided the remote tip still
matches the recorded guard.

The implementation is not authorized by current governance:

- the F-30 child spec remains `implementation_status: planned`;
- ADR-007 remains `status: proposed`;
- the roadmap states that public `dispatch`, `submit`, and `review` commands do
  not exist in the current runtime.

These canonical files remain unchanged by this retirement.

## Review findings

The GitHub review has five unresolved threads: one high-severity subproject path
normalization defect and four medium defensive-validation/error-boundary
findings. Independent review also found three high-severity blockers:

- implementation despite a non-authorizing planned spec and proposed ADR;
- missing canonical action-policy classification for the new commands;
- integration drift against current lifecycle, lazy command dispatch, catalog,
  template, and live-evidence contracts.

The branch is therefore rejected as an integration source. Future work may
reuse ideas only through a newly governed implementation and fresh tests, not
through a merge or cherry-pick.

## Archive boundary

- `source_content_archived: false`
- No bundle, patch, tag, archive branch, or code copy is retained.
- The manifest records commit IDs, parent IDs, tree IDs, dates, subjects,
  review findings, PR metadata, and the observed `refs/pull/58/head`.
- Recovery after deletion is limited to external Git object retention,
  including the closed pull-request ref if GitHub continues to retain it.
- The archive metadata itself has `deletion_approved: false` and remains until
  an explicit retention review.

## Security limitation

Gitleaks and OSV Scanner were not run on the rejected branch. Their installation
was blocked by the required `os-gov` preflight because no explicit governed OS
source-state root or machine identity is provided by this project. This review
does not claim a security scan passed.

## Retirement procedure

1. Commit and push `manifest.json` and this review to `dev`.
2. Re-read `refs/heads/feat/f30-orchestration-runtime` from `origin`.
3. Abort if it differs from
   `dc9d1657d09a5ee3e254c0df441dbd8cb982f216`.
4. Delete only that exact remote branch.
5. Verify the branch ref is absent and PR #58 remains closed and not merged.
6. Update the manifest and this review with the observed completion state.

## Current status

- Metadata recorded: yes
- Published to `dev`: pending
- Remote branch deleted: pending
- Post-deletion verification: pending
