# Tasks: gemma-agentic-tools-benchmark

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | spark-docs | Align benchmark docs/provider contract with Google Gemini function-calling and ADK/Gemma guidance. |
| T-02 | done | spark-runner | Harden direct Gemini local tool-loop harness and final artifact capture if gaps remain. |
| T-03 | done | spark-tests | Cover tool-loop, request budget, RPM/RPD, and final artifact inspection behavior with focused tests. |
| T-04 | done | spark-verifier | Run hard Gemma API scenario, inspect final plan/tasks/evidence/report, and write run report. |

## Acceptance

- T-01: docs state the real contract: Gemini/Gemma API does not execute custom
  local tools by itself; the benchmark harness must execute and return
  `functionResponse` turns. ADK/Gemma path is documented as optional/future
  integration, not current mandatory dependency.
- T-02: runner either needs no code changes with proof, or implements missing
  harness behavior without widening tool permissions beyond controlled fixture
  scope.
- T-03: focused pytest coverage passes for Gemini tool loop and API budget
  accounting.
- T-04: `.afol/tmp/benchmarks/gemini-code-task-orchestrated.json` exists, final
  fixture artifacts are inspected, token/API metrics are summarized, and failure
  is reported honestly if Gemma does not complete the hard task.
