---
name: agentic-benchmarking
description: Use when designing, running, or reviewing project-local AFOL/runtime-flow live-agent benchmarks, especially plan/task/report/evidence quality scoring, token/tool efficiency, and controlled mini-agent calibration.
metadata:
  category: testing
  tags: "benchmarking, afol, live-agent, rubric, quality-score, token-efficiency"
  triggers: "agent benchmark, AFOL benchmark, qualitative score, plan task report scoring, benchmark rubric, live agent calibration"
  version: "1.0.0"
  updated_at: "2026-06-07T00:00:00Z"
---

# Agentic Benchmarking

Use this skill for controlled live-agent benchmarks in this scaffold. Keep
benchmarks small, bounded, and evidence-driven.

## Workflow

1. Define the fixture, prompt, allowed paths, forbidden paths, acceptance
   command, and expected artifacts.
2. Measure scripted facts first: pass/fail, duration, tool calls, retries,
   token usage, acceptance command result, and evidence JSON/JSONL.
3. Score interpretive artifacts only when code cannot fully judge quality:
   plan, task, delivery report, and reviewer notes.
4. Keep prompts and artifacts concise. Prefer one plan, one task, one report,
   and one evidence record for simple code-task benchmarks.
5. Fail the run when scripted checks fail, even if rubric score is high.

## Plan And Task Rubric

Threshold: 80/100.

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

| Criterion | Weight | Pass signal |
| --- | ---: | --- |
| Functional correctness | 30 | Acceptance command passed and matches evidence. |
| Evidence/task state | 20 | Task marked done only with valid evidence. |
| Report clarity | 20 | Says session, task, change, verification, evidence, and files. |
| Scope control | 15 | Changed files stay inside allowed fixture/AFOL paths. |
| Concision | 10 | Report is compact and not a transcript. |
| Reviewer readability | 5 | Status is obvious; no contradictory success/failure wording. |

Overall score for two-phase code-task benchmarks: 40% plan/task and 60%
execution/report. Threshold: 85/100.

## Reviewer Output

Use a compact table:

```text
phase | score | pass | failed criteria | evidence
plan_task | 90 | yes | constraints/safety | no allowed-path line
report_execution | 100 | yes | - | evidence record matches command
```

Do not make qualitative scoring verbose. Quote only the smallest artifact line
needed to explain a failed criterion.
