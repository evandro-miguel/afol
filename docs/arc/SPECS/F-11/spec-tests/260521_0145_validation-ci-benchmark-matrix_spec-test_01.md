---
doc_type: spec-test
id: 260521_0145_validation-ci-benchmark-matrix_spec-test_01
theme: validation-ci-benchmark-matrix
status: draft
owners:
- tester
created_at: '2026-05-21T01:45:00+08:00'
updated_at: '2026-05-21T01:45:00+08:00'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - cli/validate
  - tests
  - .agents/data/benchmarks
  - docs/map/benchmarks
risk_level: high
---

# SPEC TEST: validation-ci-benchmark-matrix

## 1) Test Intent

Prove that validation and benchmarks measure the project on the dimensions that
matter: accuracy, speed, quality, safety, parity, and token economy.

## 2) Benchmark Packs

| Pack | Purpose | Run trigger |
| --- | --- | --- |
| `cli-kernel-local` | loader, parser, output | CLI kernel changes |
| `workbench-parity` | task/evidence/log delegation | workbench changes |
| `routing-accuracy` | rules and skills routing | router changes |
| `mutation-safety` | file mutation and undo | mutation changes |
| `update-safety` | check/plan/apply conflicts | update changes |
| `mcp-parity` | CLI vs MCP envelopes | MCP/runtime changes |
| `runtime-live-agent` | live controlled flow | risky runtime changes |
| `token-economy` | output/context cost | prompt/context changes |

## 3) Scenario Registry Contract

Scenario files live at:

```text
.agents/data/benchmarks/scenarios/<pack-id>/<scenario-id>.json
```

Each scenario must declare:

- command or MCP tool under test,
- fixture path or generator,
- expected normalized result envelope,
- side-effect oracle,
- metric thresholds,
- baseline id when comparing,
- CI selector tags.

Minimum pack coverage:

| Pack | Min | Required scenarios |
| --- | ---: | --- |
| `cli-kernel-local` | 6 | help, status, JSON, invalid root |
| `workbench-parity` | 5 | task, evidence, log, verify, close |
| `routing-accuracy` | 4 | file, task, surface, unknown |
| `mutation-safety` | 5 | dry-run, patch, move, protected, undo |
| `update-safety` | 4 | check, preview, conflict, local edit |
| `mcp-parity` | 5 | status, evidence, rule, mutation, error |
| `runtime-live-agent` | 3 | status, governed flow, MCP smoke |
| `token-economy` | 4 | help, status, routing, noisy output |

Completeness gate: a selected pack fails CI when registered scenarios are below
the minimum or any scenario lacks an oracle, threshold, or schema mapping.

Canonical initial scenario ids:

- `cli-kernel-local`: `cli-help-compact`, `cli-status-compact`,
  `cli-status-json`, `cli-invalid-root`, `cli-missing-config`,
  `cli-unsupported-command`.
- `workbench-parity`: `wb-task-start`, `wb-evidence-add`, `wb-log-add`,
  `wb-verify`, `wb-close`.
- `routing-accuracy`: `route-file`, `route-task`, `route-surface`,
  `route-unknown`.
- `mutation-safety`: `mut-dry-run`, `mut-patch`, `mut-move`,
  `mut-protected`, `mut-undo`.
- `update-safety`: `up-check`, `up-preview`, `up-conflict`,
  `up-local-edit`.
- `mcp-parity`: `mcp-status`, `mcp-evidence`, `mcp-rule`,
  `mcp-mutation`, `mcp-error`.
- `runtime-live-agent`: `live-status`, `live-governed-task`,
  `live-mcp-smoke`.
- `token-economy`: `token-help`, `token-status`, `token-routing`,
  `token-noisy-output`.

## 4) Required Result Schema

```json
{
  "run_id": "20260521-cli-status-json-01",
  "scenario_id": "cli-status-json",
  "pack_id": "cli-kernel-local",
  "profile": "local",
  "adapter_id": "cli",
  "runtime_id": "bun",
  "model_id": null,
  "model_version": null,
  "tokenizer_id": "tiktoken-o200k-base",
  "tokenizer_version": "recorded",
  "token_count_method": "tokenizer.encode",
  "token_count_source": "tokenizer",
  "token_count_status": "exact",
  "baseline_id": "cli-kernel-local-v1",
  "host_profile_id": "ci-linux-x64",
  "git_commit": "<sha>",
  "pass": true,
  "accuracy": 1,
  "duration_ms": 120,
  "timing_p50_ms": 118,
  "timing_p95_ms": 140,
  "tool_call_count": 1,
  "tool_success_rate": 1,
  "error_count": 0,
  "retry_count": 0,
  "context_tokens": 180,
  "prompt_tokens": 0,
  "output_tokens": 42,
  "context_bytes": 1024,
  "output_bytes": 240,
  "semantic_parity": true,
  "semantic_diff": []
}
```

## 5) Measurement Protocol

- Local packs run one warmup plus at least three measured samples.
- Timing comparisons use p50 and p95, never one sample.
- Baseline files live under `.agents/data/benchmarks/baselines/`.
- Baseline artifacts record scenario ids, scenario versions, sample count,
  warmup count, p50, p95, host profile, runtime versions, and git commit.
- A comparison is invalid when scenario id, tokenizer id, or host profile differs
  unless the artifact declares a compatible normalized baseline id.
- Missing baseline is reported as `baseline-missing`, not pass.
- Live packs use fixed prompt, model tier, fixture, and saved result JSON.
- Token comparisons use tokenizer-backed fields as the primary metric.
- `token-economy` scenarios fail when token fields are unavailable.
- Byte fields stay secondary for fixture and output-size tracking.

## 6) Thresholds

| Metric | Threshold |
| --- | --- |
| deterministic accuracy | `1.0` |
| live pack accuracy | `>= 0.95` |
| tool success rate | `>= 0.98` |
| deterministic errors | `0` |
| live retries | `<= 1` per scenario |
| local command p50 | `<= 2s` |
| live duration | `<= baseline * 1.25` |
| compact output | `<= 2.5KB` |
| token regression | `<= baseline * 1.10` |
| dry-run writes | `0` |
| protected path mutation | blocked |

## 7) Side-Effect Oracle

Mutating scenarios pass only when:

- pre/post file tree hashes match the allowed diff list,
- forbidden diff list is empty,
- every accepted mutation has a journal record,
- invalid-root and loader-failure cases write zero files,
- undo restores supported fixture changes,
- blocked operations return a normalized error envelope.

## 8) Evidence Format

Benchmark evidence must include:

- command run,
- scenario pack,
- baseline reference,
- sample count and warmup count,
- host/runtime/model/tokenizer profile,
- token count method, source, and status,
- result JSON path when saved,
- failed scenarios and exact metric breaches,
- whether the benchmark was required or selective.

## 9) Acceptance

- Benchmark result schema is stable.
- Every scenario names the tool or command under test.
- Every scenario names pass thresholds before implementation.
- Scenario registry meets minimum pack coverage.
- Risky runtime/tool-routing changes have a clear benchmark trigger.
- Token economy uses token-aware fields, not byte counts alone.
