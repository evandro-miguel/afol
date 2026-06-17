# Runtime Flow Benchmark Results

This directory stores runtime/eval benchmark catalog inputs for `afol bench`
and `afol validate bench`.

- Catalog inputs live under `.afol/data/benchmarks/catalog/`
- Canonical saved run location: `.afol/data/benchmarks/results/`
- Results are operational artifacts, not project-owned docs
- Benchmark runs are selective regression checks for risky execution-flow
  changes, not a universal gate
- Scenario catalog, tiering, provider profiles, and run commands are documented
  in `docs/afol-runtime-reference.md` and `docs/telemetry/QUICK_REFERENCE.md`

For Gemma/Gemini API tool-driven runs, the repository uses a local
provider-agent SDK wrapper, not a required ADK/Gemma runtime dependency:

- The benchmark provider returns `functionCall` envelopes for declared local tools.
- The local SDK wrapper exposes bounded `list_dir`, `read_file`, `write_file`,
  and allowlisted `run_shell` tools.
- The local SDK wrapper must execute tool calls, send `functionResponse` turns
  back to the API, and record `agent_progress` events in the saved payload.
- ADK/Gemma tool integration remains optional/future and is only enabled when a
  dedicated dependency is intentionally added.
- Hard scenario success requires inspected final artifacts (`plan`, `task`,
  evidence ledger, report), progress events, and API/token metrics from the
  saved payload.
