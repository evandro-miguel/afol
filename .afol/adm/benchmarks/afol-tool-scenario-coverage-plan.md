---
doc_type: benchmark-plan
id: afol-tool-scenario-coverage-plan
status: active
created_at: '2026-06-27T15:22:00Z'
updated_at: '2026-06-27T15:22:00Z'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
---

# AFOL Tool Scenario Coverage Plan

This plan defines the coverage contract for AFOL command tools and production-
like user journeys. A command is not considered production-ready only because
unit tests pass; it needs a user scenario, expected result, and evidence path.
This file is the current coverage contract and map. Metadata coverage keeps the
surface from drifting; production-readiness claims still require saved benchmark
result and report artifacts for the relevant scripted or live lane.

## Coverage Rule

- Tool source of truth: `.afol/adm/tools.json`.
- Surface source of truth: `cli/registry.ts`.
- Current required coverage: 44 command tools and 138 command/subcommand
  surface items.
- Each command needs one primary journey row.
- Each documented subcommand needs at least one scripted scenario.
- Commands with write, append, or generated side effects need fixture isolation.
- Commands that depend on agent judgment need a live-agent scenario.

## Implemented Gate

`afol validate bench` now enforces command and subcommand coverage through the
benchmark catalog contract:

- `scenario.command` covers its top-level AFOL command when it maps to
  `cli/registry.ts`.
- `scenario.coverage.commands` covers additional AFOL commands used by a
  multi-step journey.
- `scenario.coverage.subcommands` covers exact documented AFOL subcommand
  usages.
- `scenario.coverage.journeys` names the user or agent journey proved by the
  scenario.
- `scenario.coverage.features` covers roadmap feature IDs such as `F-11`.
- `scenario.coverage.specs` covers root spec IDs or paths under
  `.afol/adm/specs/*.md`.
- `scenario.implementation_status: implemented` is required before command or
  subcommand coverage counts as production proof.
- `registry.json.coverage.exemptions` and
  `registry.json.coverage.subcommand_exemptions` must stay empty for a
  full-surface claim. Any entry is visible backlog, not passing proof.
- A command or subcommand without scenario coverage or exemption fails
  validation with `tool-coverage-missing:<command>` or
  `tool-subcommand-coverage-missing:<command> <usage>`.
- An implemented scenario that declares command or subcommand coverage without
  a journey fails validation with
  `scenario-journey-coverage-missing:<pack>:<scenario>`.
- A `### F-xx` roadmap feature without a concrete governing spec fails with
  `roadmap-feature-governing-spec-missing:<feature>`.
- A roadmap feature or root spec without implemented scenario coverage fails
  with `scenario-feature-coverage-missing:<feature>` or
  `scenario-spec-coverage-missing:<spec-id>`.

This gate covers the 44 canonical commands and 94 documented subcommands as a
contract. The registry currently has zero command or subcommand exemptions. The
former 89 subcommand gaps are represented by
`governance-history/tool-surface-coverage-matrix`, and the 5 `afol ux`
subcommands are covered by `governance-history/ux-registry-lifecycle`.
Roadmap feature and root spec coverage is represented by
`governance-history/feature-spec-coverage-matrix`.

## Auditor Findings

Late audit on 2026-06-27 found the right failure mode: the registry gate could
prove that a scenario named a command, but it did not yet prove that the full
user journey was executed. This slice hardened the gate so skipped scenarios no
longer count as production proof, and implemented scenarios that cover commands
or subcommands must name at least one journey.

Resolved in this slice:

- `registry.json.coverage.exemptions` and
  `registry.json.coverage.subcommand_exemptions` are empty.
- The full 138-surface command/subcommand map is covered by implemented
  scenarios with named journeys.
- Skipped scenarios do not count as production proof.
- Implemented command/subcommand coverage must name at least one journey.
- Roadmap feature coverage must name a governing spec, and each root spec must
  appear in at least one implemented benchmark scenario.
- Runtime live-agent coverage must load the saved result artifact named by the
  snapshot; a missing artifact fails validation.
- `afol ux coverage --tool <tool>` canonicalizes public aliases before matching
  journeys.

Remaining discipline:

- Metadata coverage is not a license to skip deeper executable tests when a
  command behavior changes. The changed command must update or add the relevant
  scripted, fixture-mutation, live-agent, or UX scenario.
- `min_scenarios` is still count-based; scenario diversity must be reviewed in
  this matrix and in saved benchmark reports.

## Scenario Shape

Every scenario must record:

- objective
- primary actor
- entry command or task prompt
- expected AFOL tools or command family
- allowed fixture scope
- expected output or state change
- warnings that should appear
- failure/recovery behavior
- evidence artifact
- token/output budget

## Lane Split

| Lane | Use for | Gate |
| --- | --- | --- |
| `scripted-surface` | Deterministic command and subcommand behavior. | Every `subcommands[].usage` has at least one scenario. |
| `fixture-mutation` | Writes, appends, generated state, migrations, update previews, and protected paths. | Fixture proves dry-run, state change, recovery, and protected-path handling. |
| `live-agent` | Open-ended operator work where the agent must choose tools. | Saved run shows exact command/tool calls, warnings, tokens, and pass/fail report. |
| `ux-journey` | User-facing flow expectations. | Existing roadmap/spec/spec-test/evidence chain names command path, output, states, recovery, and metrics. |

## First Implementation Slice

1. Add a registry-to-scenario coverage test that compares `cli/registry.ts`,
   `.afol/adm/tools.json`, and catalog scenario metadata.
2. Add or expand scripted packs before adding more live-agent prompts:
   `validation-gates`, `ops-observability`, and `platform-controls`.
3. Extend the existing workflow pack for `init`, `bootstrap`, `quick-task`,
   and subcommand-only forms of `new`, `done`, `evidence`, and `close`.
4. Keep `runtime-live-agent` as the live-agent lane. Expand it only for a named
   production failure mode that cannot be proven by a scripted fixture.
5. Keep `afol ux` as a reader/validator over existing artifacts and use it to
   expose UX coverage, not as a new registry source of truth.

## Depth Targets

No registry exemption gaps remain. These targets are for deeper behavior
coverage when the command changes or a production incident exposes a weak path:

- Expand dedicated fixtures for `init`, `bootstrap`, `quick-task`, `hook`,
  `skill`, `file`, `update`, `health`, `db`, `doctor`, `sweep`, `schema`,
  `bench`, `project-benchmark`, `catchup`, `preflight`, `adapter`, `telemetry`,
  and `session` when their behavior changes.
- Add narrower exact-usage fixtures for `validate`, `new`, `done`, `evidence`,
  `close`, `local-state`, `ctx`, and `spec` when a subcommand contract changes.
- `maintenance` already has a live-agent baseline; add more maintenance live
  prompts only when they prove a distinct failure mode.
- Do not count implementation smoke scenarios as catalog coverage unless they
  are registered as benchmark scenarios with objective, expected result, and
  evidence lane.

## Coverage Backlog

| Pack or slice | Purpose | Initial scope |
| --- | --- | --- |
| `validation-gates` | Scripted validation coverage. | `validate` subcommands and benchmark pack selectors. |
| `ops-observability` | Scripted health and maintenance observability. | `health`, `db`, `doctor`, `sweep`, `catchup`, and `preflight`. |
| `platform-controls` | Scripted platform and telemetry coverage. | `bench`, `project-benchmark`, `adapter`, `telemetry`, and `session`. |
| existing workflow pack | Scripted workbench and scaffold coverage. | `init`, `bootstrap`, `quick-task`, `new`, `done`, `evidence`, and `close` subcommand forms. |
| `mutation-safety` / `update-safety` | Mutation/update safety coverage. | Add only missing `file` and `update` exact usages not already covered. |
| `runtime-live-agent` | Agent-judgment flows. | Keep maintenance baseline; add research, memory, workbench, update, or benchmark live scenarios only when scripted coverage is insufficient. |
| `ux-journey-registry` | Active validation over registered journeys. | Keep `governance-history/ux-registry-lifecycle` current; add stricter failing fixtures when journeys drift. |

## Tool Matrix

| Tool | Journey | Required scenario | Expected proof |
| --- | --- | --- | --- |
| `afol status` | Operator checks project and active session state. | scripted status compact/json plus live workbench preflight. | Status output names session, blockers, warnings, and next action. |
| `afol validate` | Maintainer proves project, drift, and selected benchmark gates. | scripted validation pack selector plus bench pack run. | Valid JSON or compact pass/fail with actionable failures. |
| `afol init` | Operator previews scaffold install into a fixture repo. | dry-run fixture install. | Preview lists writes without mutating fixture. |
| `afol start` | Execution agent starts a governed task. | workbench fixture and live workbench agent. | State Board moves task to `in_progress`. |
| `afol done` | Execution agent completes a task only after evidence. | workbench fixture with missing-evidence failure and success path. | Missing evidence blocks; valid evidence marks task done. |
| `afol new` | Maintainer creates governed workbench session. | fixture session creation with feature/spec metadata. | Plan/task/log/evidence files exist and metadata links feature/spec. |
| `afol log` | Agent records progress without changing task state. | append fixture. | Log entry is appended and task state is unchanged. |
| `afol quick-task` | Operator executes single-task lifecycle with command evidence. | fixture quick task. | Session opens, evidence records command, task closes. |
| `afol evidence` | Agent records task-scoped proof. | append fixture and strict verify. | Evidence ledger contains command, result, task id, and timestamp. |
| `afol hook` | Agent inspects static hook metadata. | scripted inspect. | Output resolves hooks without executing scripts. |
| `afol rule` | Agent resolves relevant rules. | scripted routing plus live research scenario. | Expected rules are selected with compact rationale. |
| `afol skill` | Agent resolves local skills. | scripted skill list/show plus live routing scenario. | Project-local skills are preferred over global duplicates. |
| `afol close` | Agent closes a session after verification. | workbench fixture and missing-proof failure path. | Close fails without complete tasks/evidence and passes after proof. |
| `afol file` | Mutation agent patches, moves, archives, and undoes safely. | isolated mutation fixture. | Dry-run, journal, protected-path block, and undo are proven. |
| `afol update` | Operator checks, previews, and dry-runs scaffold update. | update fixture with clean and conflict cases. | Local edits are preserved or surfaced as conflicts. |
| `afol bootstrap` | Operator installs scaffold into another repo. | dry-run and fixture bootstrap. | Downstream payload has config/rules/skills/templates and no local `afol` binary. |
| `afol verify` | Agent verifies workbench tasks. | workbench fixture. | Verification reports State Board/evidence consistency. |
| `afol verify-tasks` | Agent performs strict lifecycle validation. | strict fixture with drift case. | Duplicate checklist drift is caught; valid State Board passes. |
| `afol local-state` | Agent rebuilds or inspects indexes. | scripted generated-state fixture. | Index freshness and output shape are reported. |
| `afol pstr` | Agent checks project structure maps. | scripted stale/show/validate fixture. | Stale maps warn and trusted context rejects stale input. |
| `afol ctx` | Research agent builds/selects context bundles. | scripted bundle/explain plus live research scenario. | Bundle explains refs, token budget, gaps, and freshness. |
| `afol state` | Agent reads current AFOL state snapshot. | scripted state fixture. | Snapshot reports session, indexes, and health without mutation. |
| `afol hydrate` | Agent generates hydrated project state. | generated-state fixture. | Hydrated output is deterministic and bounded. |
| `afol render` | Compatibility agent uses deprecated memory render alias. | scripted alias fixture. | Alias warns/delegates without reviving retired surfaces. |
| `afol library` | Research agent searches and shows source-backed library entries. | scripted library pack plus live research/library scenario. | Claims include source/freshness, or stale claims warn. |
| `afol memory` | Memory agent recalls, proposes, archives, and renders memory. | scripted memory pack plus live memory scenario. | Memory operations preserve provenance and require review for cleanup. |
| `afol adm` | Maintainer inspects AFOL administration paths. | scripted adm paths/show/validate. | Output separates `.afol/adm`, `.afol/pstr`, `.afol/wb`, and mutable data. |
| `afol spec` | Agent searches, checks, and waives spec contracts. | governance-history pack plus live research scenario. | Spec links feature, parent, child, and expected validation. |
| `afol ux` | Maintainer lists, validates, registers, and checks coverage for user journeys. | governance-history `ux-registry-lifecycle`. | List/show/validate/coverage/register dry-run pass, and maintenance warning journey is visible. |
| `afol adr` | Architect records or inspects decisions. | governance-history ADR fixture. | ADR is created/queried with decision status and links. |
| `afol changelog` | Maintainer records notable changes. | governance-history changelog fixture. | Entry is appended with date, scope, and evidence link. |
| `afol health` | Maintenance agent checks domain freshness. | scripted health areas plus live maintenance scenario. | Memory/library/state/token warnings are visible and compact. |
| `afol db` | Operator inspects local database state. | scripted db health fixture. | Schema, migration, size, and integrity state are reported. |
| `afol doctor` | Operator requests remediation plan. | scripted doctor fixture plus live maintenance scenario. | Ordered remediation plan names risk and next safe command. |
| `afol maintenance` | Agent surfaces weekly/monthly cleanup and review needs. | scripted weekly/monthly/review plus live maintenance scenario. | Warnings include memory, library, sessions, rules, skills, docs, commands. |
| `afol sweep` | Agent runs repository sweep checks. | scripted sweep fixture. | Sweep reports due/stale surfaces without destructive cleanup. |
| `afol schema` | Operator reviews schema evolution. | dry-run schema fixture. | Detect/suggest/review is read-only; writes require explicit flag. |
| `afol bench` | Maintainer runs benchmark packs and live metrics. | benchmark runner fixture and live benchmark scenario. | Result schema includes pass/fail, timing, tool calls, retries, tokens. |
| `afol project-benchmark` | Maintainer compares AFOL against reference systems. | scripted project benchmark fixture. | Comparison uses curated axes and avoids unsupported claims. |
| `afol catchup` | Agent detects unsynced session context. | scripted active-session drift fixture. | Output names changed files and missing session sync. |
| `afol preflight` | Agent searches governance before planning. | scripted preflight plus live research scenario. | Relevant specs, lessons, systems, and rules are returned before plan. |
| `afol adapter` | Operator toggles runtime adapters safely. | dry-run adapter fixture. | Preview shows config change and avoids runtime mutation until confirmed. |
| `afol telemetry` | Maintainer queries/export telemetry. | scripted telemetry fixture plus live benchmark scenario. | Output reports events, metrics, export path, and token budget. |
| `afol session` | Operator lists, binds, switches, and unbinds sessions. | workbench fixture plus live workbench scenario. | Session state changes are explicit and recoverable. |

## Acceptance Gates

- Tool count in this matrix equals `.afol/adm/tools.json` tool count.
- `registry.json.coverage.exemptions` and
  `registry.json.coverage.subcommand_exemptions` are empty.
- Scripted surface scenarios cover every `subcommands[].usage` entry.
- Skipped scenarios, disabled scenarios, and exemption rows do not count as
  production proof.
- Multi-step and live-agent scenarios carry `coverage.journeys` and bind to
  evidence, not only command strings.
- Every `### F-xx` roadmap feature has exactly one concrete governing spec in
  `.afol/adm/specs/*.md`.
- Every roadmap feature appears in implemented `scenario.coverage.features`.
- Every root spec appears in implemented `scenario.coverage.specs`.
- Runtime live-agent validation fails when the saved result artifact is missing.
- Live-agent results log actual tool calls, not only final prose.
- Maintenance scenarios verify the warning behavior for stale sessions, memory,
  library, rules, skills, docs, commands, and organization.
- UX journey validation fails when a command-changing spec lacks an expected
  output, failure/recovery path, and evidence plan.
