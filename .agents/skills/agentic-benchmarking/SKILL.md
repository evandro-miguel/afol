---
name: agentic-benchmarking
description: Use when designing or reviewing AFOL runtime live-agent benchmarks, fixed harness profiles, external receipts, token and latency thresholds, tool success, or benchmark comparability. Do not use for one lifecycle smoke or reference-project comparison.
metadata:
  category: testing
  tags: "benchmarking, afol, live-agent, external-harness, receipts, latency, token-efficiency, tool-success"
  triggers: "agent benchmark, AFOL benchmark, runtime live-agent, fixed harness profile, benchmark receipt, token threshold, latency threshold, tool success, benchmark comparability"
  references: "validate-bench, receipts, harness-profiles, telemetry, token-economy"
  version: "1.1.0"
  updated_at: "2026-08-10T00:00:00Z"
  target_provider: universal
  tier: 1
---

# Agentic Benchmarking

Use this skill for controlled runtime-flow benchmarks whose model execution is
owned by an external harness. AFOL publishes fixed tool profiles, validates
bounded receipts, stores benchmark artifacts, and checks the results; it never
selects, calls, schedules, retries, or supervises models.

## Ownership Boundaries

- Use `afol-integration-test` for one end-to-end CLI or lifecycle smoke.
- Use `afol project-benchmark` to compare reference projects such as Aider or
  OpenHands against the AFOL project catalog.
- Use this skill for repeated external agent runs, controlled profiles,
  thresholds, comparability, and benchmark evidence.

## Workflow

1. Freeze the scenario before execution: prompt, fixture commit, allowed and
   forbidden paths, acceptance commands, expected AFOL commands, fixed harness
   profile id/digest, timeout, and thresholds.
2. Let the external harness execute the model and emit a redacted receipt bound
   to the exact project, session, task, source commit, run, and profile.
3. Validate the receipt and observed evidence through AFOL. Missing, stale,
   mismatched, secret-like, or incomparable evidence fails closed.
4. Measure scripted facts first: command coverage, exit status, wall time,
   provider-reported tokens, tool attempts, tool success, retries, and required
   artifacts.
5. Use qualitative scoring only for behavior that deterministic checks cannot
   judge, such as plan clarity or reviewer readability.
6. Validate the saved result with the narrow pack gate:

   ```bash
   afol validate bench --pack <pack-id> --json
   ```

7. Treat infrastructure, authentication, transport, timeout, or unavailable
   provider failures as inconclusive or blocked. Never convert them into a pass.

## Thresholds And Comparability

- Routine output above 5,000 tokens warns; above 10,000 fails.
- Pin the exact harness id, provider/model identifier reported by the harness,
  fixed tool profile digest, source commit, prompt, and acceptance commands.
- Compare like with like. A changed profile, prompt, fixture, timeout, or
  required command set starts a new baseline unless the change is the tested
  variable.
- Report p50/p95 only when the sample size and warm-up policy are explicit.
- A high rubric score cannot rescue a failed scripted gate, unsafe receipt, or
  missing observed evidence.

## Plan And Task Rubric

Threshold: 80/100.
Required gates: scope/target, validation/evidence, constraints/safety, and task
executability.

| Criterion | Weight | Pass signal |
| --- | ---: | --- |
| Scope and target | 25 | Names objective, project folder, and exact files to touch. |
| Execution path | 20 | Gives ordered, actionable steps tied to task IDs. |
| Validation/evidence | 20 | Names exact acceptance command and evidence requirement. |
| Constraints/safety | 15 | States allowed boundaries and avoids provider-hostile paths. |
| Concision | 10 | Short enough for a small executor to use without re-reading. |
| Task executability | 10 | Task row has state, owner/intent, target file, and acceptance command. |

## Execution And Report Rubric

Threshold: 85/100.
Required gates: functional correctness, evidence/task state, and scope control.

| Criterion | Weight | Pass signal |
| --- | ---: | --- |
| Functional correctness | 30 | Acceptance command passed and matches evidence. |
| Evidence/task state | 20 | Task marked done only with valid evidence. |
| Report clarity | 20 | Says session, task, change, verification, evidence, and files. |
| Scope control | 15 | Changed files stay inside allowed fixture/AFOL paths. |
| Concision | 10 | Report is compact and not a transcript. |
| Reviewer readability | 5 | Status is obvious; no contradictory success/failure wording. |

Overall score for two-phase code-task benchmarks: 40% plan/task and 60%
execution/report. Threshold: 85/100. Keep this rubric secondary to scripted
correctness, receipt integrity, command coverage, and benchmark-pack validation.

## Reviewer Output

Use a compact table:

```text
phase | score | pass | failed criteria | evidence
plan_task | 90 | yes | constraints/safety | no allowed-path line
report_execution | 100 | yes | - | evidence record matches command
```

Do not make qualitative scoring verbose. Quote only the smallest artifact line
needed to explain a failed criterion.

## Evidence Report

Report the pack, fixture commit, harness/profile identity, run and receipt ids,
sample count, thresholds, command coverage, token and timing summaries, tool
success, deterministic gate result, qualitative score when used, and residual
risk. Do not paste transcripts or raw receipts.
