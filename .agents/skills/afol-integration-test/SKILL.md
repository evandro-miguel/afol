---
name: afol-integration-test
description: Use when running live integration tests of the AFOL CLI tool, workbench lifecycle, agent orchestration, and token/latency telemetry. Covers session creation, plan/task quality scoring, agent delegation, evidence collection, and teardown validation.
metadata:
  category: testing
  tags: "integration-test, afol, lifecycle, telemetry, token-measurement, orchestration, benchmark"
  triggers: "integration test, afol test, live test, orchestration test, agent test, telemetry test, lifecycle test, token measurement"
  version: "1.0.0"
  updated_at: "2026-06-10T00:00:00Z"
  target_provider: universal
---

# AFOL Integration Test

Use this skill to run controlled integration tests of the AFOL CLI in a real
project. Measure tool performance, agent delegation quality, and token
efficiency.

## Prerequisites

- `afol` installed globally and pointing at current build
- Project validated: `afol validate project` passes
- Baseline git state captured, with pre-existing changes identified and preserved

## Test Fixture

For each test run:

1. Record `TELEMETRY_START=$(date +%s%N)` before first afol command
2. Create session: `afol new "<theme>" --intent "<scope>" --task "<acceptance>"`
3. Add more `--task "<acceptance>"` arguments when the run needs multiple tasks
4. Start task: `afol start --session <session> --task-id T-01`
5. Log plan: `afol log --session <session> --message "<execution plan>"`
6. Delegate bounded read-only analysis to agent(s)
7. Record returned evidence with this command:

   ```bash
   afol evidence --session <session> --task-id T-01 \
     --command "<what>" --result passed
   ```

8. Mark the task done: `afol done --session <session> --task-id T-01`
9. Create the required report for a multi-task session
10. Close: `afol close --session <session>`
11. Record `TELEMETRY_END=$(date +%s%N)`

## Telemetry Capture

For each test run, record these facts:

```text
run_id: <session_id>
timestamp: <ISO 8601>
duration_ms: <end - start>
afol_commands: <count>
afol_failures: <count>
afol_retries: <count>
agent_type: explore | build | architect | general
tool_calls_total: <count>
tool_calls_by_type: {read: N, edit: N, bash: N, grep: N, glob: N}
files_read: <count>
files_edited: <count>
tokens_estimated: <count if available>
```

## Agent Delegation Protocol

When testing agent orchestration:

1. **Orchestrator** is the single writer for AFOL lifecycle state
2. **Orchestrator** creates the session, starts tasks, writes logs, records
   evidence, marks tasks done, and closes the session through the AFOL CLI
3. **Planner and specialist agents** inspect bounded scope and return findings;
   they do not mutate shared lifecycle state
4. **Executor agent** changes product files only within its assigned scope
5. **Orchestrator** validates results: `afol validate project`, `bun test`,
   `bun run typecheck`

Lifecycle state has one writer. File editing is only for product changes,
never for plan, task, or log files.

## Quality Scoring

Apply the agentic-benchmarking rubric after each run:

- Plan/Task rubric: threshold 80/100
- Execution/Report rubric: threshold 85/100
- Combined: 40% plan + 60% execution, threshold 85/100

Score compactly:

```text
phase | score | pass | failed criteria | evidence
plan_task | XX | yes/no | criteria name | evidence line
report_exec | XX | yes/no | criteria name | evidence line
```

## Known Limitations

- Token counts are estimated unless the provider reports usage.
- Wall-clock duration uses shell timestamps. AFOL lifecycle and command events
  use the native telemetry stream under `.afol/data/events/events.jsonl`.

## Failure Protocol

If a run scores below threshold:

1. Record the failure with evidence
2. Inspect `git status` and preserve all unrelated user changes
3. Apply the smallest reversible correction
4. Run `afol local-state rebuild --json` only when the local index is stale
5. Re-run with corrected parameters
6. Compare Run N vs Run N+1 telemetry
