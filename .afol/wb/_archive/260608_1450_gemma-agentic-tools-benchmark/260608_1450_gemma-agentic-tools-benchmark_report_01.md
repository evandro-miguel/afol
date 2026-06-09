# Gemma/Gemini Hard Benchmark Verification Report

## STATUS

FAIL. The hard benchmark did not pass because the saved JSON proves final plan,
task, evidence, and report artifacts were missing. The model returned a
self-reported success JSON, but no tool calls were observed and no required
delivery artifacts existed.

## COMMAND

```bash
python3 .agents/scripts/agents-benchmark.py run live-afol-python-code-task-orchestrated --provider-config .agents/data/benchmarks/providers/gemini-gemma4-31b.json --output .afol/tmp/benchmarks/gemini-code-task-orchestrated.json --pretty
```

Exit code: `1`.

Output artifact:
`.afol/tmp/benchmarks/gemini-code-task-orchestrated.json`.

## RESULT

- `pass`: `false`
- `scenario`: `live-afol-python-code-task-orchestrated`
- `duration_ms`: `38819`
- `checks_total`: `53`
- `checks_passed`: `19`
- `accuracy`: `0.3585`

## API_USAGE

- `api_request_count`: `2`
- `api_rpm_limit`: `15`
- `api_rpd_limit`: `1500`
- `api_rpm_peak`: `2`
- `api_rpd_count`: `20`
- `api_rate_limited`: `false`
- `api_throttle_delay_ms`: `0`

## TOKEN_USAGE

- `available`: `true`
- `input_tokens`: `44`
- `output_tokens`: `144`
- `total_tokens`: `188`
- `cached_input_tokens`: `0`
- `uncached_input_tokens`: `44`
- `uncached_total_tokens`: `188`
- `reasoning_output_tokens`: `0`

## TOOL_USAGE

- `tool_call_count`: `0`
- `tool_success_count`: `0`
- `tool_success_rate`: `0.0`
- `observed_tool_calls`: `[]`

No command excerpts exist because the API run did not produce any tool calls.

## FINAL_ARTIFACTS

- `plan`: missing. `path=""`, `exists=false`.
- `task`: missing. `path=""`, `exists=false`.
- `evidence_jsonl`: missing.
  `path=".afol/wb/session_12345/.evidence.jsonl"`, `exists=false`.
- `report`: missing.
  `path="test-code-task-project/benchmark_report.md"`, `exists=false`.
- `text_utils`: inspected. `exists=true`; content still raises
  `NotImplementedError("slugify is not implemented yet")`.
- `acceptance_check`: inspected. `exists=true`; expected command is
  `python3 scripts/check_slugify.py`.

## FAILURES

- Required artifact missing in final output: `plan`.
- Required artifact missing in final output: `task`.
- Required artifact missing in final output: `report`.
- Required artifact missing in final output: `evidence_jsonl`.
- Slugify acceptance check failed during benchmark validation.
- Code task T-01 not marked done.
- Code task report missing.
- Evidence ledger missing slugify check and passed result.
- Executor report quality score: `0/100`, below threshold `85`.
- Observed `tool_call_count 0 < 4`.
- Required AFOL command groups not observed: `new`, `start`, `evidence`,
  `done`.

## NOTES

The benchmark correctly refused to pass on self-reported JSON. The verifier read
the saved result file and confirmed the required final artifacts were absent.
Current Gemini/Gemma direct API path did not exercise local tools for this hard
scenario in this run.
