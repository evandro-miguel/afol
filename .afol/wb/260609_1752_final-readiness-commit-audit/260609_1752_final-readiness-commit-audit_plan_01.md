# Plan: final-readiness-commit-audit

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-04
- parent_spec: 260521_0040_governance-workbench-system_spec_01
- task: Final readiness audit, fix, review gates, coverage, Python/UV CLI cleanup, docs cleanup, and commit

## Execution Plan

- T-01: Final readiness audit, fix, review gates, coverage, Python/UV CLI cleanup, docs cleanup, and commit.
- Round 1 audit:
  - code logic / CLI boundary and behavior review
  - docs / Python-UV / legacy-public-surface review
  - tests / coverage / anti-test-weakening review
- Round 2 fixes:
  - route concrete failing findings to disjoint file owners
  - avoid weakening tests to make gates pass
- Round 3 reviewers:
  - test coverage reviewer
  - docs/surface reviewer
  - release/governance reviewer
- Finalize:
  - record evidence
  - close strict workbench checks
  - commit on `main_dev`

## Acceptance Criteria

- Worktree committed at the end on `main_dev`.
- Repository has no unstaged/staged tracked changes after commit, except expected ignored generated outputs.
- Coverage gate passes at >=80%.
- Public CLI and downstream template do not depend on Python, uv, `.agents/scripts`, or `.agents/runtime`.
- Documentation does not present Python, uv, legacy aliases, or legacy just command runners as public downstream CLI usage.
- No tests are weakened to make gates pass.
- Each major gate gets an independent reviewer pass; failed reviews create fix slices before closeout.

## Validation

- `gitnexus status`
- `gitnexus impact` before editing symbols, when edits are needed
- `bun run coverage:check`
- `bun run typecheck`
- `bun test`
- `bun run validate:toolchain`
- `bun run validate:release`
- `bun run smoke:clean`
- `./afol local-state rebuild`
- `./afol local-state freshness`
- `./afol validate project`
- `./afol verify-tasks --strict`
- `gitnexus detect-changes -r agentic-start-folder`
- `git diff --check`
- `git status --short --branch`

## Closure Criteria

- Reviewer failures are resolved or documented as impossible with proof.
- T-01 is marked done only after passed evidence exists.
- Commit includes the implemented and audited changes.
- Final response states exact commit hash and remaining ignored generated outputs.
