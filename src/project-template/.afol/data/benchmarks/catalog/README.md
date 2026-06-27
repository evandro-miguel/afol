# AFOL Benchmark Results

This directory stores optional JSON outputs from AFOL benchmark runs when
`--save` or `--output` targets a path under `.afol/data/benchmarks/`.

- Canonical default save location: `.afol/data/benchmarks/results/`
- Results are operational artifacts, not project-owned docs
- Benchmark runs are selective regression checks for risky execution-flow
  changes, not a universal gate
- Runtime benchmark packs use AFOL commands such as `afol bench` and
  `afol validate bench`
- Project benchmark catalogs use `.afol/adm/project-benchmarks/` and
  `.afol/data/project-benchmarks/`

## Tool And Journey Coverage

Every AFOL command and documented subcommand in `cli/registry.ts` must be
represented by at least one benchmark scenario or by an explicit temporary
exemption in `registry.json.coverage`.

- Use `scenario.coverage.commands` when a scenario exercises additional AFOL
  commands indirectly, such as a live agent journey that runs `afol new`,
  `afol start`, `afol evidence`, `afol done`, and `afol close`.
- Use `scenario.coverage.subcommands` when a scenario proves an exact
  documented subcommand usage.
- Use `scenario.coverage.journeys` to name the user or agent journey proved by
  the scenario.
- Keep exemptions specific. An exemption means the command still needs a
  scenario fixture; it is not permanent coverage. Subcommand gaps belong in
  `registry.json.coverage.subcommand_exemptions`.
- `afol validate bench` fails when a registered command or subcommand has
  neither scenario coverage nor an exemption.

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
