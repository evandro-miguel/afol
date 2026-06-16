# Plan: spec-code-closure

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-18
- parent_spec: 260612_afol-brain-shape-retrieval-doctor-trust_spec-child_01.md

## Execution Plan

### T-01: Wire OperationContext into CLI entry
- Modify `cli/main.ts` to accept documented caller flags/env (`--agent`/`-A`, `--remote`/`-R`, `AFOL_AGENT`, `AFOL_REMOTE`) that construct restricted `OperationContext`
- Ensure restricted agent/remote contexts hit existing mutation gates in `OperationContext.canMutate()` / `requiresApproval()`
- Add unit test for restricted context mutation denial

### T-02: Implement schema cache-key contract
- Update schema detector (`cli/commands/brain.ts` or `src/schema/`) to emit cache key with fields: `shape_name`, `shape_version`, `source_path`, `source_hash`, `git_branch`, `git_commit` (when available)
- Propagate cache key through schema review outputs
- Add unit tests verifying cache-key structure and git metadata inclusion

### T-03: Coverage for quick-task.ts
- Audit `cli/commands/quick-task.ts` for existing test coverage
- If gaps exist, add direct coverage for command parsing, context construction, and execution paths
- If already covered, document coverage map in task evidence

### T-04: Acceptance-targeted evidence commands
- Add evidence command for CLI restricted-context mutation denial (invoke CLI with `--agent` or `AFOL_AGENT=true`, expect denial)
- Add evidence command for schema cache-key output (run schema detect/review, verify JSON includes all contract fields)
- Add evidence command for `ctx explain` (verify context explanation output)
- Add evidence command for doctor remediation (run `afol doctor` with known issue, verify remediation output)
- Add evidence command for `pstr/library` command probes (verify command structure and output)

### T-05: Final gates
- `bun run lint:biome`
- `bun run typecheck`
- `bun test`
- `./afol validate project --json`
- `./afol health --deep`
- `./afol validate drift --json`
- No open tasks remaining

## Validation

- Each sub-task produces evidence recorded via `afol evidence`
- Final gates run as a block; all must pass

## Closure Criteria

- All 5 sub-tasks marked done with passed evidence
- Final gates pass
- Delivery notes identify changed files and verification results

(End of file)