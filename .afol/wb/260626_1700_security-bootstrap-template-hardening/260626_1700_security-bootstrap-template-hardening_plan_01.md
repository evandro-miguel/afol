# Plan: security-bootstrap-template-hardening

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-08
- parent_spec: 260521_0080_safe-file-mutation-and-undo_spec_01
- task: Rebuild stale local-state index
- task: Block bootstrap and Claude adapter symlink write-through
- task: Block secret-bearing files in template payload policy

## Execution Plan

- T-01: Rebuild stale local-state index
- T-02: Block bootstrap and Claude adapter symlink write-through
- T-03: Block secret-bearing files in template payload policy
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
