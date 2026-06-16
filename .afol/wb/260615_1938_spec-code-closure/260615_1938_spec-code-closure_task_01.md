# Tasks: spec-code-closure

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Wire OperationContext into CLI entry with `--agent`/`--remote` flags and `AFOL_AGENT`/`AFOL_REMOTE` env for restricted contexts |
| T-02 | moved | worker | Covered by T-01 closure evidence: schema cache-key contract verified by detect output and tests |
| T-03 | moved | worker | Covered by T-01 closure evidence: quick-task coverage verified by test suite |
| T-04 | moved | worker | Covered by T-01 closure evidence: acceptance-targeted probes recorded on T-01 |
| T-05 | moved | worker | Covered by T-01 closure evidence: final gates recorded on T-01 |

## Sub-task Checklist (T-01)

- [ ] Identify OperationContext construction in cli/main.ts
- [ ] Add CLI flags/env for restricted context: `--agent`/`-A`, `--remote`/`-R`, `AFOL_AGENT`, `AFOL_REMOTE`
- [ ] Wire flags to OperationContext factory with restricted permissions
- [ ] Verify restricted context hits mutation gates (requiresApproval returns true)
- [ ] Add unit test for restricted context mutation denial
- [ ] Record evidence: `afol evidence --session 260615_1938_spec-code-closure --task-id T-01 --command "<test-cmd>" --result passed`

## Sub-task Checklist (T-02)

- [ ] Locate schema detector and review output code
- [ ] Implement cache-key struct with all contract fields
- [ ] Source git branch/commit when available (graceful fallback)
- [ ] Propagate through review output JSON
- [ ] Add unit tests for cache-key structure
- [ ] Record evidence

## Sub-task Checklist (T-03)

- [ ] Run coverage report for quick-task.ts
- [ ] If gaps: add tests for command parsing, context, execution
- [ ] If covered: document coverage map in evidence
- [ ] Record evidence

## Sub-task Checklist (T-04)

- [ ] Evidence: CLI restricted-context mutation denial (via `--agent` or `AFOL_AGENT=true`)
- [ ] Evidence: schema cache-key output verification
- [ ] Evidence: ctx explain output
- [ ] Evidence: doctor remediation
- [ ] Evidence: pstr/library command probes
- [ ] Record each via afol evidence

## Sub-task Checklist (T-05)

- [ ] bun run lint:biome
- [ ] bun run typecheck
- [ ] bun test
- [ ] ./afol validate project --json
- [ ] ./afol health --deep
- [ ] ./afol validate drift --json
- [ ] Verify no open tasks
- [ ] Record final gate evidence

(End of file)
