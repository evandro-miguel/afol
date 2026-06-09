---
doc_type: plan
id: 260609_1130_merge-main-dev-consolidation_plan_01
session: 260609_1130_merge-main-dev-consolidation
status: in_progress
created_at: '2026-06-09T11:30:00-03:00'
updated_at: '2026-06-09T11:30:00-03:00'
feature_id: F-19
parent_spec: null
---

# Plan: Consolidate All Branches into main_dev

## Context

Branch `merge/dev-refactor-ts-afol` is the canonical direction with 70 commits
ahead of `origin/main_dev`. Several other branches exist in the repo; most are
already ancestors of the current branch. Two Jules-bot branches diverged but
carry only legacy test hygiene patches.

**Goal:** merge the current branch into `origin/main_dev`, producing a clean
integration with all work consolidated.

## Branch Inventory

| Branch | Relation to Current | Action |
|--------|-------------------:|--------|
| `origin/main_dev` | ancestor (base) | Target. Update local, then fast-forward merge. |
| `origin/merge/dev-refactor-ts-afol` | ancestor | Already contained. Push local commit. |
| `origin/dev_refactor_TS` | ancestor | Already contained. |
| `checkpoint/260531_233642_benchmark-dev-lane` | ancestor | Already contained. |
| `origin/main` | ancestor | Already contained. |
| `origin/hygiene-cleanup-*` | diverged, 0-file diff vs HEAD | Skip. Empty/metadata only. |
| `origin/fix/test-hygiene-*` | diverged, 1 commit | Do NOT merge whole branch. Cherry-pick only if needed. |

## Current Worktree State

- Branch: `merge/dev-refactor-ts-afol`
- HEAD: `ed9e1a4 fix: close afol validation and governance gaps`
- Ahead 1 of `origin/merge/dev-refactor-ts-afol` (unpushed commit)
- Dirty working tree: 126 modified + 131 untracked files
  - `.afol/wb/_archive/` — archived sessions moved from active
  - `.afol/wb/260609_1000_recurring-issues-prevention/` — active session
  - `.agents/rules/RULE-008..010` — new governance rules
  - `docs/arc/DECISIONS/ADR-001..002` — new ADRs
  - `docs/lessons/entries/` — 9 new lessons
  - `cli/**` — validation hardening (8 files)
  - `.agents/rules/index.json` — rule index update

## Phases

### Phase 1: Commit WIP on source branch

Separate into 2-3 logical commits:

1. **Commit A — governance hardening:**
   - `.agents/rules/index.json`
   - `.agents/rules/RULE-008-evidence-gated-closure.md`
   - `.agents/rules/RULE-009-legacy-surface-retirement.md`
   - `.agents/rules/RULE-010-benchmark-quality-contract.md`
   - `docs/arc/DECISIONS/INDEX.md`
   - `docs/arc/DECISIONS/ADR-001-bun-typescript-canonical-runtime.md`
   - `docs/arc/DECISIONS/ADR-002-afol-sole-public-entrypoint.md`
   - `docs/lessons/entries/20260609_*.md` (9 files)
   - `AGENTS.md`, `CLAUDE.md`

2. **Commit B — validation + workbench fixes:**
   - `cli/commands/status.ts`
   - `cli/commands/validate.ts`
   - `cli/schemas/template-policy.ts`
   - `cli/services/local-state/workbench-index.ts`
   - `cli/services/project/validate.ts`
   - `cli/services/workbench/verify.ts`
   - `cli/tests/template-policy.test.ts`
   - `cli/tests/workbench-verify.test.ts`

3. **Commit C — archive and session data:**
   - `.afol/wb/_archive/**` (archived sessions)
   - `.afol/wb/260609_1000_recurring-issues-prevention/**`
   - `.afol/wb/260609_1130_merge-main-dev-consolidation/**` (this plan)

**Verification per commit:**
```bash
bun run typecheck
bun test cli/tests/template-policy.test.ts cli/tests/workbench-verify.test.ts
git diff --check
```

### Phase 2: Push source branch

```bash
git push origin merge/dev-refactor-ts-afol
```

### Phase 3: Create safety backup + integration branch

Executed from root worktree (`/home/ozy/apps/agentic_start_folder`):

```bash
git fetch --all --prune
git checkout main_dev
git reset --hard origin/main_dev
git branch backup/main_dev-pre-ts-afol-260609
git checkout -b merge/main_dev-consolidation
```

### Phase 4: Fast-forward merge

```bash
git merge --ff-only merge/dev-refactor-ts-afol
```

If fast-forward fails (new remote commits), rebase instead:
```bash
git rebase origin/main_dev merge/dev-refactor-ts-afol
# then retry merge
```

### Phase 5: Final validation gates

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run validate:release
bun run smoke:clean
afol validate --json
git diff --check
```

### Phase 6: Update main_dev and push

```bash
git checkout main_dev
git merge --ff-only merge/main-dev-consolidation
git push origin main_dev
```

### Phase 7: Cleanup branches

After push confirmed:

- Close/delete `origin/hygiene-cleanup-*` (empty diff)
- Close/delete `origin/fix/test-hygiene-*` (legacy, not needed)
- Close/delete `checkpoint/260531_233642_benchmark-dev-lane` (contained)
- Optionally close `origin/dev_refactor_TS` (contained)
- Optionally close `origin/merge/dev-refactor-ts-afol` after merge

## Risks

| Risk | Mitigation |
|------|-----------|
| WIP mixes incomplete code with archive data | Split into logical commits; gate each with typecheck |
| `main_dev` local stale | Reset hard to `origin/main_dev` before merge |
| New remote commits on main_dev | Rebase instead of ff-only |
| `validate:release` heavy | Run focused gates first, broad gate last |
| Legacy Jules branches conflict | Skip entirely; not needed for TS direction |

## Acceptance Criteria

- [ ] All WIP committed in logical units on `merge/dev-refactor-ts-afol`
- [ ] `bun run typecheck` passes
- [ ] `bun test` passes
- [ ] `origin/main_dev` contains all commits from this branch
- [ ] No file conflicts or lost changes
- [ ] Safety backup branch exists: `backup/main_dev-pre-ts-afol-260609`
- [ ] `bun run validate:release` passes on integrated state
