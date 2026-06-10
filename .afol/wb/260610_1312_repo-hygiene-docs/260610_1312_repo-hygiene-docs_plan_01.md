# Plan: repo-hygiene-docs

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Audit and update 5 active doc files that reference retired .agents commands. Target files: docs/standards/metrics.md, docs/standards/bootstrap-other-repo.md, docs/arc/ARCHITECTURE.md, docs/templates/AGENTS_TEMPLATE.md, docs/patterns/INDEX.md. Do NOT touch specs/ lessons/ decisions/.
- task: Update 5 active doc files: replace legacy .agents command references with current afol equivalents. Acceptance: afol validate project passes, bun run typecheck passes, git diff shows only docs changes.

## Execution Plan

- T-01: Update 5 active doc files: replace legacy .agents command references with current afol equivalents. Acceptance: afol validate project passes, bun run typecheck passes, git diff shows only docs changes.
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- T-01 is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
