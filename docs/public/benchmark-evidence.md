# Runtime benchmark evidence

`afol validate bench --pack runtime-live-agent --json` validates an external
harness run and executes the deterministic acceptance checks declared in the
project's scenario catalog. AFOL does not run models. A completed agent turn,
an external `pass: true`, or a favorable token count does not establish delivery.

## Freeze acceptance before the run

Add `acceptance` to each selected scenario in
`.afol/data/benchmarks/catalog/scenarios/runtime-live-agent/`. Use real project
checks and list every delivered file whose identity the checks depend on:

```json
{
  "acceptance": {
    "checks": [{ "id": "behavior", "argv": ["bun", "test", "tests/answer.test.ts"] }],
    "artifacts": ["src/answer.ts", "tests/answer.test.ts"]
  }
}
```

The four bundled scenario definitions are `planned`: they describe workloads
without a frozen project fixture or acceptance contract. They do not constitute
live delivery proof. Prepare a project-owned catalog, add the concrete checks
and artifacts, set `result_schema` to `2.0.0`, and mark the configured scenarios
`implemented`. A pack containing only planned scenarios remains skipped with
`pass: false`; it must not be presented as a live benchmark success.

Checks run as argv arrays in the project root. Receipt fields never supply
commands. The local catalog and its check programs are operator-owned inputs;
review them before running validation. This is local deterministic verification,
not remote attestation or a sandbox for hostile check programs.

At least one check and one artifact are required. Paths must identify regular
files inside the project; traversal, symlinks, and sensitive paths are rejected.
Contracts allow at most eight checks and 64 artifacts. Each check has a
30-second timeout, with a shared 60-second check budget and bounded output.
The verifier checks the full source commit, contract digest, and exact artifact
set before execution, then checks integrity again during verification. A failed
check, unavailable executable, timeout, or changed artifact cannot pass.

The contract digest is SHA-256 of UTF-8 compact JSON with keys in this order:
`checks`, `artifacts`. Each check contains `id`, then `argv`, preserving check
and argv order. Artifact paths are sorted lexicographically. The source helper
`acceptanceContractDigest` implements this canonical representation.

## Versioned external receipt

The entrypoint remains
`.afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json`.
Snapshot schema `2.0.0` requires these fields:

| Field | Contract |
| --- | --- |
| `schema_version` | `2.0.0` |
| `pack_id` | `runtime-flow-live-agent-v4` |
| `generated_at` | ISO timestamp, no future date, at most seven days old |
| `stale_after_days` | `7` |
| `benchmark_profile` | Current fixed profile: `codex`, `gpt-5.6-luna`, `medium` |
| `event_profile` | Harness identity/version, adapter format, and explicit usage semantics |
| `scenarios` | Unique external scenario IDs with `events` and `acceptance` |

The Luna profile starts a new baseline; old `gpt-5.4-mini` receipts remain
historical and must not be relabeled or compared as equivalent runs.
The fixed benchmark profile remains a comparison requirement, not a request for
AFOL to invoke that model. `event_profile` records the external harness version
and uses the AFOL adapter contract `format: "codex-exec-v1"`,
`usage_mode: "delta"` or `"cumulative"`, and
`token_details: "included"` or `"exclusive"`. Unknown adapter formats fail.
The adapter version describes event shape; it is not an assertion that every
version of the harness has been tested.

Each scenario has an `id` matching the catalog's `live_runner_scenario_id`, an
array of event objects, and this acceptance evidence:

```json
{
  "source_commit": "<full current Git commit>",
  "contract_sha256": "<SHA-256 of the frozen acceptance contract>",
  "artifacts": [
    { "path": "src/answer.ts", "sha256": "<SHA-256 of delivered bytes>" },
    { "path": "tests/answer.test.ts", "sha256": "<SHA-256 of check bytes>" }
  ]
}
```

The optional `saved_result_path` must identify a JSON file under the project's
benchmark `results/` or `snapshots/` directory. It must exist, have the same
schema/profile and timestamp, and contain the scenario evidence. There is no
fallback to a stale snapshot when an explicitly referenced file is missing.
Input JSON is bounded to 4 MiB, 64 scenarios, and 4,096 events per scenario.
Use redacted events; credentials and private transcripts are not benchmark inputs.

## Measurement semantics

- Delta usage adds each identified completed turn once. Cumulative usage uses
  the final snapshot; decreasing counters fail as ambiguous evidence.
- With `included`, cache-read/cache-write are input details and reasoning is an
  output detail. Total tokens are input plus output. With `exclusive`, all five
  reported categories are added. Missing required categories remain `null`.
- Cache writes accept the current Codex `cache_write_input_tokens` field and
  the older `cache_creation_input_tokens` alias. Conflicting values fail.
- Missing durations, usage, and tool outcomes remain unknown. Pair timestamped
  `item.started` and `item.completed` events for tool duration. The external
  harness can add timestamped `run.started`/`run.completed` boundaries to record
  wall time. A line number is never a duration.
- Commands, file reads/edits, MCP calls, and supported other tools contribute to
  tool totals. Agent messages do not. Identified duplicate events are counted
  once; conflicting duplicates fail. Anonymous events cannot be safely
  deduplicated across turns, so harnesses should provide stable event/item IDs.
- Tool failures and explicit retries remain visible even when independent
  acceptance later succeeds. Catalog thresholds still apply.
- Plan quality is unknown; English phrases in an agent message are not a
  quality score. A single run does not establish p50 or p95. Percentile gates
  require scenario `timing_samples` with explicit `warmup_count` and a `samples`
  array of unique `run_id`, `started_at`, and `finished_at` observations. At
  least two samples must remain after warmups; the limit is 64 including warmups.
  Samples inherit the frozen scenario/profile/artifact contract and must precede
  the receipt timestamp by no more than seven days. AFOL derives nearest-rank
  p50/p95 from these external observations; it does not verify provider execution.
  Do not substitute one run's wall time or silently remove a catalog threshold.

The live gate requires observed total usage, wall time, and tool success rate,
plus all metrics required by the selected thresholds. Failure due to missing
observations does not claim a failed model task. Check results distinguish
failed checks from unavailable processes or timeouts.

Runtime result rows use schema `2.0.0` and retain nullable measurements. The
outer validation response identifies a homogeneous result schema, or `mixed`
when packs return different versions. Historical schema `1.0.0` snapshots and
legacy benchmark archives cannot authorize this gate. `afol bench report`
continues to display legacy archives with their historical accounting; those
numbers are not directly comparable to normalized `afol_metrics_v1` results.
