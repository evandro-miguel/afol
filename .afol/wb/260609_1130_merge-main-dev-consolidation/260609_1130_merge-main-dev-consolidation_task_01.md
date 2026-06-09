---
doc_type: task
id: 260609_1130_merge-main-dev-consolidation_task_01
session: 260609_1130_merge-main-dev-consolidation
status: in_progress
created_at: '2026-06-09T11:30:00-03:00'
updated_at: '2026-06-09T11:30:00-03:00'
---

# Tasks

## T-01: Commit WIP in logical units on source branch [/]
- [ ] Commit A: governance hardening (rules, ADRs, lessons, AGENTS.md)
- [ ] Verify: `bun run typecheck`
- [ ] Commit B: validation + workbench fixes (cli/**)
- [ ] Verify: `bun test cli/tests/template-policy.test.ts cli/tests/workbench-verify.test.ts`
- [ ] Commit C: archive + session data (.afol/wb/**)
- [ ] Verify: `git diff --check`

## T-02: Push source branch [ ]
- [ ] `git push origin merge/dev-refactor-ts-afol`
- [ ] Confirm remote matches local HEAD

## T-03: Prepare main_dev for integration [ ]
- [ ] Fetch all remotes
- [ ] Reset local main_dev to origin/main_dev
- [ ] Create safety backup: `backup/main_dev-pre-ts-afol-260609`
- [ ] Create integration branch: `merge/main_dev-consolidation`

## T-04: Fast-forward merge into integration branch [ ]
- [ ] `git merge --ff-only merge/dev-refactor-ts-afol`
- [ ] Verify: `git rev-list --left-right --count origin/main_dev...HEAD` = 0 ahead
- [ ] Verify: `git merge-base --is-ancestor origin/main_dev HEAD`

## T-05: Final validation gates [ ]
- [ ] `bun install --frozen-lockfile`
- [ ] `bun run typecheck`
- [ ] `bun test`
- [ ] `bun run validate:release`
- [ ] `bun run smoke:clean`
- [ ] `afol validate --json`
- [ ] `git diff --check`

## T-06: Update main_dev and push [ ]
- [ ] Checkout main_dev
- [ ] Fast-forward to integration branch
- [ ] `git push origin main_dev`
- [ ] Verify: remote main_dev matches expected HEAD

## T-07: Cleanup obsolete branches [ ]
- [ ] Close/delete `origin/hygiene-cleanup-*`
- [ ] Close/delete `origin/fix/test-hygiene-*`
- [ ] Delete local `checkpoint/260531_233642_benchmark-dev-lane`
- [ ] Optionally close `origin/dev_refactor_TS` and `origin/merge/dev-refactor-ts-afol`
