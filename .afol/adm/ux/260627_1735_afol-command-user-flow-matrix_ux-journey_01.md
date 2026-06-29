---
doc_type: ux-journey
id: 260627_1735_afol-command-user-flow-matrix_ux-journey_01
theme: afol-command-user-flow-matrix
status: active
owners:
- orchestrator
created_at: '2026-06-27T17:35:36Z'
updated_at: '2026-06-27T17:35:36Z'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
source_spec: 260627_1122_afol-tool-scenario-coverage-and-ux-registry_spec-child_01
benchmark_pack: all-tool-surface
---

# UX Journey: AFOL Command User Flow Matrix

## Purpose

- User or agent: maintainer, delegated agent, benchmark runner, release
  reviewer, maintenance reviewer.
- Goal: every AFOL command family has a documented user journey with objective,
  expected result, scenario lane, and evidence expectation before anyone claims
  production readiness.
- Context: AFOL command behavior changes, benchmark coverage is audited, a
  project is bootstrapped, or an agent must decide which AFOL tool to use.

## Entry And Exit

- Entry point: `afol ux coverage --tool <afol-command>`, `afol validate bench`,
  or a workbench task asking whether a tool is production-ready.
- Success exit: each command in `.afol/adm/tools.json` maps to at least one UX
  journey, one expected result, and one benchmark or workbench evidence lane.
- Recovery exit: missing coverage becomes a named backlog row in
  `.afol/adm/benchmarks/afol-tool-scenario-coverage-plan.md` and blocks claims
  that all AFOL tools were tested.

## Flow

1. Operator identifies the affected AFOL tool.
   - Information shown: command id, wrapper command, side effect, and known
     subcommands from `.afol/adm/tools.json`.
   - User or agent decision: choose read-only, dry-run, sandboxed write, or
     live-agent scenario lane.
   - AFOL command/tool: `afol ux coverage --tool <afol-command>`.
   - System state: read-only UX coverage projection.
   - Possible failure: no matching journey.
   - Recovery: add or repair a journey before marking the tool covered.
2. Agent runs the scenario lane for the tool.
   - Information shown: compact output, warnings, durable state mutation, and
     evidence path.
   - User or agent decision: decide whether output is correct and whether a
     warning/review prompt is required.
   - AFOL command/tool: `afol validate bench --pack <pack-id> --json`.
   - System state: benchmark result or workbench evidence is recorded.
   - Possible failure: scenario skipped, missing journey, missing subcommand, or
     output token budget exceeded.
   - Recovery: add an implemented scenario, add `coverage.journeys`, or tighten
     command output.
3. Release reviewer checks the full matrix.
   - Information shown: every command family and every still-exempted
     subcommand.
   - User or agent decision: block or approve the claim that AFOL tool coverage
     is production-ready.
   - AFOL command/tool: `afol ux validate` and `afol validate bench --json`.
   - System state: no mutation unless the reviewer records workbench evidence.
   - Possible failure: exemptions are being treated as proof.
   - Recovery: keep exemptions as backlog only; do not call them tested.

## Tool Flow Matrix

| Tool | Primary journey objective | Expected result | Scenario lane |
| --- | --- | --- | --- |
| `afol status` | Operator inspects project/workbench state before acting. | Compact status names project health, sessions, warnings, and stale state without mutating files. | `cli-kernel-local` status compact/JSON scenario plus workbench evidence. |
| `afol validate` | Reviewer verifies project, drift, bench selection, and benchmark execution gates. | Failing gate names exact issue id; passing gate returns compact JSON. | `validate-project-flow` and `validate-bench-flow` scripted scenarios. |
| `afol init` | Operator previews or installs AFOL scaffold into a project. | Dry-run lists intended writes; real run creates only approved scaffold files. | `init-dry-run` plus sandboxed install scenario. |
| `afol start` | Agent starts a governed task from an existing workbench session. | Task state changes to in progress and start briefing shows maintenance/session warnings. | `governed-task-lifecycle` live-agent scenario. |
| `afol done` | Agent completes a task only after validation/evidence exists. | Task state changes to done and evidence is linked. | `governed-task-lifecycle` plus spec-check scenario. |
| `afol new` | Maintainer creates a governed workbench session tied to roadmap/spec intent. | Session files contain feature/spec metadata and canonical state board. | `governed-task-lifecycle` and workbench parity scenarios. |
| `afol log` | Agent appends a timeline note without editing files by hand. | Session log receives an append-only entry. | `wb-log-add` scripted scenario. |
| `afol quick-task` | Operator runs a bounded one-command task with evidence. | Session/task/evidence are created and closed through AFOL, not raw files. | quick-task sandbox scenario or named backlog until implemented. |
| `afol evidence` | Agent records command, artifact, note, and pass/fail outcome. | Evidence ledger is append-only and task remains auditable. | `wb-evidence-add` scripted scenario. |
| `afol hook` | Agent inspects provider-neutral hook context metadata. | Output lists hooks without executing scripts or mutating lifecycle state. | hook inspection scenario. |
| `afol rule` | Agent inspects active AFOL rules before planning/execution. | Output lists rule ids, status, and stale-review signals. | rule inspection and maintenance review scenario. |
| `afol skill` | Agent finds project-local skills such as memory, library, and maintenance. | Output lists available skills and does not install or delete skills. | skill inspection plus bootstrap scaffold scenario. |
| `afol close` | Agent closes a validated workbench session. | Session closes only when task state/evidence gates pass. | `governed-task-lifecycle` and `wb-close`. |
| `afol file` | Agent patches, moves, archives, or undoes files through AFOL mutation tracking. | Mutation id, dry-run diff, archive path, or undo result is recorded. | mutation-safety scenarios for patch/move/archive/undo. |
| `afol update` | Maintainer checks, previews, dry-runs, and applies scaffold updates. | Check is compact; preview/dry-run show conflicts; real apply requires session/task/reason. | update-safety scenarios, including real apply in sandbox. |
| `afol bootstrap` | Operator seeds downstream project governance, config, skills, and rules. | Dry-run names writes; real run inserts `.agents/skills` and AFOL static payload only. | `bootstrap-preview` and `bootstrap-apply` sandbox scenarios. |
| `afol verify` | Reviewer verifies a workbench session artifact. | Strict mode fails on drift, missing evidence, or invalid lifecycle state. | `wb-verify` scenario. |
| `afol verify-tasks` | Reviewer verifies task state board consistency. | Duplicate/stale task state is rejected. | verify-tasks strict scenario. |
| `afol local-state` | Agent rebuilds or checks generated local indexes. | Freshness output or rebuilt state stays compact and generated-only. | validation-flow live-agent scenario. |
| `afol pstr` | Agent refreshes/read project structure maps. | Project structure maps reflect current repo without storing scripts in `.afol/pstr`. | pstr rebuild/status scenario. |
| `afol ctx` | Agent builds scoped context bundles instead of over-reading. | Bundle/section output is bounded and names source refs. | context-bundles scenarios. |
| `afol state` | Agent inspects AFOL state summary. | Output identifies mutable state surfaces without direct raw traversal. | state inspection scenario. |
| `afol hydrate` | Agent hydrates generated context from AFOL state. | Generated output is reproducible and non-authoritative. | hydrate generated-output scenario. |
| `afol render` (deprecated compatibility alias) | Agent encounters an old render reference and uses the compatibility path only when needed. | Current read/render surfaces remain preferred; compatibility output is deterministic and non-mutating. | Deprecated alias coverage only; not primary journey coverage. |
| `afol library` | Library agent inspects reusable knowledge and stale library review needs. | Output or warning tells user when aggregation/cleanup/review is due. | library-knowledge and maintenance cadence scenarios. |
| `afol memory` | Memory agent inspects memory state and weekly cleanup/review needs. | Output or warning tells user when memory compaction/cleanup/relevance review is due. | memory-governance and maintenance cadence scenarios. |
| `afol adm` | Governance agent inspects roadmap/spec/manifest/admin state. | Output points to canonical `.afol/adm` governance without direct mutation. | adm governance scenario. |
| `afol spec` | Agent lists, checks, conflicts, or waives specs tied to a session/task. | Spec conflict blocks done unless waived with reason. | governance-history spec scenarios. |
| `afol ux` | Reviewer lists, shows, validates, covers, and registers user journeys. | Missing journeys or required fields are visible before coverage claims. | `ux-registry-lifecycle`. |
| `afol adr` | Architect inspects or creates decision records through AFOL flow. | ADR is discoverable and linked to governing context. | `adr-new` governance-history scenario. |
| `afol changelog` | Release reviewer records or inspects change history. | Changelog entry is structured and audit-friendly. | `changelog-add` governance-history scenario. |
| `afol health` | Operator checks health signals before deeper validation. | Output summarizes health without making changes. | health inspection scenario. |
| `afol db` | Operator inspects AFOL DB/index state. | Output reports DB status or migration need without silent writes. | db inspection scenario. |
| `afol doctor` | Operator diagnoses AFOL environment/config readiness. | Output names missing dependencies, stale state, or repair action. | doctor inspection scenario. |
| `afol maintenance` | Maintenance agent runs weekly/monthly/review cadence checks. | Warnings show overdue rules, skills, docs, commands, memory, library, organization, old sessions, roadmap/spec/manifest review needs. | `maintenance-cadence-review` live-agent scenario. |
| `afol sweep` | Agent performs daily sweep/readiness review. | Output surfaces maintenance actions and stale project state. | sweep maintenance scenario. |
| `afol schema` | Maintainer detects, suggests, reviews, writes resolver, and applies schema migrations. | Dry-run shows migrations; apply is sandboxed and reversible. | `schema-inspect` and `schema-write` scenarios. |
| `afol bench` | Benchmark agent lists, runs, reports, and exercises runtime-live scenarios. | Run/report output is saved, compact, and linked to scenario id. | `bench-surface` scenario. |
| `afol project-benchmark` | Reviewer evaluates project benchmark matrix and recommendations. | Matrix/recommendation/generate output is deterministic and validated. | `project-benchmark-surface` scenario. |
| `afol catchup` | Agent catches up stale sessions/spec context before continuing. | Output names what changed and what must be reviewed. | catchup inspection scenario. |
| `afol preflight` | Operator runs preflight before risky operation or release gate. | Output blocks on missing validation, warnings, or unsafe state. | preflight inspection scenario. |
| `afol adapter` | Operator lists or previews provider adapter changes. | Dry-run enable/disable shows payload; real mutation requires explicit approval. | adapter dry-run scenario. |
| `afol telemetry` | Reviewer queries token/tool/latency telemetry for agent behavior. | Output reports counts, token use, commands used, and export path without leaking secrets. | telemetry query/report/export scenario. |
| `afol session` | Agent lists, binds, switches, or unbinds workbench sessions. | Session selection is explicit and stale multi-session warning remains visible. | session lifecycle scenario. |

## Expected Result

- Output: `afol ux coverage --tool <id>` returns at least one journey for every
  command id in `.afol/adm/tools.json`.
- Durable state change: read-only tools do not mutate; write tools use dry-run,
  sandbox, workbench evidence, or explicit session/task/reason gates.
- Warning or review prompt: memory/library cleanup, weekly maintenance, stale
  workbench sessions, roadmap/spec/manifest refresh, rules, skills, docs, and
  command review prompts are visible in maintenance or start-briefing flows.
- Token/output budget: default command output should stay under 5k output
  tokens; benchmark thresholds may be stricter per scenario.

## Evidence

- Scripted scenario:
  `.afol/data/benchmarks/catalog/scenarios/**` with `implementation_status:
  implemented`, `coverage.commands`, `coverage.subcommands`, and
  `coverage.journeys`.
- Live-agent scenario:
  `.afol/data/benchmarks/catalog/scenarios/runtime-live-agent/live-maintenance-cadence.json`
  and future live-agent scenarios for benchmark, memory, research, telemetry,
  and session routing.
- Benchmark pack: `afol validate bench --json` for full release claims;
  targeted `afol validate bench --pack <pack-id> --json` while burning down
  one tool family.
- Report or workbench evidence:
  `.afol/wb/<session>/.evidence.jsonl` plus saved benchmark reports under
  `.afol/data/benchmarks/results/**` when available.

## Metrics

- Completion criterion: every `.afol/adm/tools.json` command id has UX coverage
  and every implemented benchmark scenario with tool coverage also has
  `coverage.journeys`.
- Error/retry criterion: missing command coverage, skipped placeholder
  scenarios, stale exemptions, or missing subcommand coverage block full
  coverage claims.
- User effort or latency criterion: operator can find the journey from
  `afol ux list`, inspect it with `afol ux show`, and validate coverage without
  opening raw AFOL state files.

## Acceptance

- [x] Primary actor and goal are explicit
- [x] Steps, states, failures, and recovery are explicit
- [x] Expected AFOL tools are named
- [x] Expected output and durable state change are explicit
- [x] Evidence path is explicit
