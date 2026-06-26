# Tasks: spec-code-closure

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Wire OperationContext into CLI entry with `--agent`/`--remote` flags and `AFOL_AGENT`/`AFOL_REMOTE` env for restricted contexts |
| T-02 | done | worker | Covered by T-01 closure evidence: schema cache-key contract verified by detect output and tests |
| T-03 | done | worker | Covered by T-01 closure evidence: quick-task coverage verified by test suite |
| T-04 | done | worker | Covered by T-01 closure evidence: acceptance-targeted probes recorded on T-01 |
| T-05 | done | worker | Covered by T-01 closure evidence: final gates recorded on T-01 |

## Sub-task Checklist (T-01)

- [x] Identify OperationContext construction in cli/main.ts
- [x] Add CLI flags/env for restricted context: `--agent`/`-A`, `--remote`/`-R`, `AFOL_AGENT`, `AFOL_REMOTE`
- [x] Wire flags to OperationContext factory with restricted permissions
- [x] Verify restricted context hits mutation gates (requiresApproval returns true)
- [x] Add unit test for restricted context mutation denial
- [x] Record evidence: `afol evidence --session 260615_1938_spec-code-closure --task-id T-01 --command "<test-cmd>" --result passed`

## Sub-task Checklist (T-02)

- [x] Locate schema detector and review output code
- [x] Implement cache-key struct with all contract fields
- [x] Source git branch/commit when available (graceful fallback)
- [x] Propagate through review output JSON
- [x] Add unit tests for cache-key structure
- [x] Record evidence

## Sub-task Checklist (T-03)

- [x] Run coverage report for quick-task.ts
- [x] If gaps: add tests for command parsing, context, execution
- [x] If covered: document coverage map in evidence
- [x] Record evidence

## Sub-task Checklist (T-04)

- [x] Evidence: CLI restricted-context mutation denial (via `--agent` or `AFOL_AGENT=true`)
- [x] Evidence: schema cache-key output verification
- [x] Evidence: ctx explain output
- [x] Evidence: doctor remediation
- [x] Evidence: pstr/library command probes
- [x] Record each via afol evidence

## Sub-task Checklist (T-05)

- [x] bun run lint:biome
- [x] bun run typecheck
- [x] bun test
- [x] ./afol validate project --json
- [x] ./afol health --deep
- [x] ./afol validate drift --json
- [x] Verify no open tasks
- [x] Record final gate evidence

(End of file)
