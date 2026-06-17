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
- Project validated: `afol validate project` passes 16/16
- Clean git working tree

## Test Fixture

For each test run:

1. Record `TELEMETRY_START=$(date +%s%N)` before first afol command
2. Create session: `afol new "<theme>" --intent "<scope>" --task "<acceptance>"`
3. Start task: `afol start -S <session> -T T-01`
4. Log plan: `afol log -S <session> "<execution plan>"`
5. Delegate to agent(s)
6. Record evidence: `afol evidence -S <session> -T T-01 --command "<what>" --result passed`
7. Done: `afol done -S <session> -T T-01`
8. Close: `afol close -S <session>`
9. Record `TELEMETRY_END=$(date +%s%N)`

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

1. **Orchestrator** creates session and task via afol CLI
2. **Planner agent** (explore type) reads project state via afol commands
   and writes plan to `afol log`
3. **Executor agent** (build type) performs work and records evidence via
   `afol evidence`
4. **Orchestrator** validates results: `afol validate project`, `bun test`,
   `bun run typecheck`

Each agent must use afol CLI for lifecycle operations. File editing is only
for product changes, never for plan/task/log files.

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

- `afol new --task` accepts only ONE task (T-01). Multi-task sessions
  require manual file editing or a future `afol task add` command.
- Token counts are estimated unless the provider reports usage.
- Telemetry is shell-based (date +%s%N), not nanosecond-precise.

## Failure Protocol

If a run scores below threshold:

1. Record the failure with evidence
2. `git reset --hard` to before the failed run
3. Rebuild: `afol local-state rebuild`
4. Re-run with corrected parameters
5. Compare Run N vs Run N+1 telemetry
