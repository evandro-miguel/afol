---
doc_type: ux-journey
id: 260627_1611_afol-agent-experience-map_ux-journey_01
theme: afol-agent-experience-map
status: active
owners:
- orchestrator
- maintenance-agent
- benchmark-agent
created_at: '2026-06-27T20:11:00Z'
updated_at: '2026-06-27T20:11:00Z'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
source_skill: ux-design@1.1.0
workbench_session: 260627_1611_agent-ux-experience-map
benchmark_pack: runtime-live-agent
---

# UX Journey: AFOL Agent Experience Map

## Purpose

- User or agent: maintainer, orchestrator, delegated agent, maintenance agent,
  benchmark agent, and release reviewer.
- Goal: make every agent-facing AFOL workflow explicit enough that an agent can
  enter the project, select the right AFOL tool, see required warnings, record
  evidence, and close work without relying on unstated operator knowledge.
- Context: a user asks agents to plan, benchmark, maintain, clean up, review,
  update, or execute AFOL-governed work across workbench sessions, memory,
  library, rules, specs, roadmap, skills, telemetry, and benchmark artifacts.

## Entry And Exit

- Entry point: `afol status`, `afol new`, `afol start`, `afol ux list`,
  `afol maintenance weekly --dry-run`, or a delegated-agent handoff.
- Success exit: the agent can name the current journey, expected command path,
  durable state change, warning behavior, evidence path, and closure gate before
  claiming the tool or workflow is production-ready.
- Recovery exit: missing or stale UX evidence becomes a registry, benchmark, or
  workbench backlog item instead of being treated as passing proof.

## Facts, Assumptions, Unknowns

- Facts:
  - `afol ux validate --json` passed before this map with 0 issues.
  - `afol start --session 260627_1611_agent-ux-experience-map --task-id T-01`
    surfaced stale-session and overdue-review warnings for rules, skills, docs,
    commands, memory, library, and organization.
  - Project-local and template-local `ux-design` skills now exist under
    `.agents/skills/ux-design/` and `src/project-template/.agents/skills/ux-design/`.
  - Existing coverage is strongest around `new`, `start`, `evidence`, `done`,
    `close`, and `session` lifecycle operations.
  - Delegated-agent UX existed as practice and handoff guidance, but not as a
    standalone journey.
- Assumptions:
  - Provider agents receive enough project context to discover `.agents/skills`
    and AFOL workbench state without a separate global skill install.
  - Compact warning output is enough for routine agent work if validation keeps
    command output below AFOL token budgets.
  - Live-agent scenarios can verify delegated-agent behavior without granting
    agents unsafe write scope.
- Unknowns:
  - Whether every provider UI shows the same warnings as the CLI start briefing.
  - Whether all telemetry result artifacts currently bind token counts, command
    paths, and agent ids tightly enough for release-grade review.
  - Whether downstream projects will consistently run maintenance cadence checks
    before stale memory/library/workbench state affects planning.

## Current Experience Map

| Phase | Action | Thought or question | Emotion or risk | Touchpoint | Evidence | Friction | Opportunity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Discover | Agent checks project state. | What is active and what is stale? | Risk of acting on old session/context. | `afol status`, `afol session radar`, `.afol/wb/.active_session`. | `afol start` briefing emitted stale-session and overdue-review prompts. | Warnings are visible, but spread across status/start/maintenance. | Make journey say which command owns which warning. |
| Scope | Orchestrator creates governed work. | Which roadmap/spec owns this? | Risk of ad hoc work without parent spec. | `afol new`, roadmap, parent spec, workbench plan/task. | Session `260627_1611_agent-ux-experience-map`. | Delegation can skip explicit UX journey if not required. | Tie complex agent work to `ux-design` and standalone journey. |
| Handoff | Orchestrator delegates to helper agents. | What can this agent touch and prove? | Risk of vague prompt, wrong root, legacy surface, or no evidence. | Agent message, skill refs, session/task ids, write scope. | Three agents produced read-only UX findings for lifecycle, maintenance, and docs. | No AFOL command models delegation as a first-class journey. | Require handoff contract in UX maps. |
| Execute | Agent runs AFOL commands. | Which command is safe, dry-run, or mutating? | Risk of unsafe write or token-heavy output. | `afol maintenance`, `afol memory`, `afol library`, `afol update`, `afol validate`, `afol ux`. | Tests and scenarios exist for many command families. | Memory/library/maintenance have partial E2E linkage. | Add scenario lanes that connect command families into one journey. |
| Warn | System surfaces review/cadence needs. | Do I need cleanup, aggregation, archive, or spec refresh? | Risk that old files become silent planning input. | Start briefing, maintenance weekly/monthly/review, health, rules. | Start briefing listed overdue reviews. | Warning UX is not yet provider-UI verified. | Live-agent scenario should assert warnings are shown and acted on. |
| Prove | Agent records validation. | What evidence proves this did work? | Risk of claiming tests without artifacts. | `.evidence.jsonl`, benchmark results, reports, telemetry exports. | Workbench evidence commands and benchmark scenarios. | Some scenarios have unit coverage but no full live journey. | Bind scripted and live evidence to the UX journey. |
| Close | Reviewer completes work. | Is task done or just edited? | Risk of closing without evidence, spec check, or drift review. | `afol done`, `afol close`, `afol verify-tasks --strict`. | Lifecycle commands enforce task state. | Old sessions can accumulate if weekly review is skipped. | Maintenance journey must include old-session review and archive decision. |

## Target Experience Map

| Phase | Target behavior | Change needed | Owner | Metric | Validation |
| --- | --- | --- | --- | --- | --- |
| Discover | Agent can identify active session, stale state, and required review in one compact pass. | Keep `status`, `start`, and `maintenance` warnings aligned. | CLI maintainer | Warning appears in expected command output. | `afol status`, `afol start`, `afol maintenance weekly --dry-run`. |
| Scope | Every non-trivial agent workflow maps to roadmap/spec and, when complex, a UX journey. | Enforce journey registration or explicit backlog. | Orchestrator | No complex agent flow lacks journey/backlog. | `afol ux validate`; coverage plan review. |
| Handoff | Delegated agents receive objective, root, write scope, skills, evidence, and closure gates. | Document handoff contract in registry standard and journey. | Orchestrator | Delegated findings include paths, gaps, and evidence. | Live-agent scenario and workbench evidence. |
| Execute | Agents select the specific AFOL tool family for memory, library, maintenance, update, validation, UX, telemetry, and session work. | Add chained E2E scenarios for partial command families. | Benchmark agent | Command family has scripted or live scenario. | `afol validate bench --pack <pack-id> --json`. |
| Warn | Weekly/monthly review prompts cover memory, library, sessions, rules, skills, docs, commands, roadmap, specs, and manifest. | Assert warnings in scenario expected output. | Maintenance agent | Missing warning fails scenario. | Maintenance cadence live-agent scenario. |
| Prove | Claims cite exact evidence paths and token/tool telemetry when relevant. | Bind live scenarios to saved result artifacts. | Benchmark agent | Evidence references command, result, and artifact. | `.evidence.jsonl`; benchmark result JSON; `afol telemetry`. |
| Close | Agent cannot close as done without validation and documented residual gaps. | Keep done/close gates strict. | Reviewer | Open tasks/sessions are intentional or archived. | `afol done`, `afol close`, `afol verify-tasks --strict`. |

## Service Blueprint

| Phase | Frontstage | Backstage | Systems or data | Policy or guardrail | Failure mode |
| --- | --- | --- | --- | --- | --- |
| Bootstrap | Dry-run or scaffold output names files and skills. | Template payload inserts config, governance docs, rules, and `.agents/skills`. | `src/project-template/**`, `.agents/manifest.json`. | No downstream local AFOL executable or legacy `.agents` runtime. | Scaffold writes forbidden or legacy surfaces. |
| Status/start | Compact briefing shows session and review warnings. | Local state and workbench events resolve active task/session. | `.afol/wb/**`, `.afol/data/index/**`. | Output budget below 5k; stale state must be visible. | Agent acts on stale session or misses overdue review. |
| Delegation | Agent handoff names role, root, scope, skill, task, and output contract. | Orchestrator selects bounded specialists and consolidates findings. | Subagent prompts, workbench session, UX skill. | Subagents do not replace local verification. | Duplicate work, vague output, or no evidence path. |
| Maintenance | Weekly/monthly/review output lists due cleanup and review. | Cadence evaluator checks memory, library, sessions, rules, skills, docs, commands, organization. | `.afol/memory/**`, `.afol/library/**`, `.afol/wb/**`, `.afol/adm/**`. | Dry-run by default; no deletion without approval. | Warnings exist in code but are not exercised by journey. |
| Validation | Validator reports registry, project, and benchmark issues. | Registry loads specs, UX docs, benchmark catalog, and scenarios. | `docs/standards/user-journey-registry.md`, `.afol/adm/ux/**`, `.afol/data/benchmarks/**`. | Full coverage claim requires scenarios and evidence. | Exemptions or partial tests misreported as full coverage. |
| Closure | `done` and `close` record final state. | Workbench state board and evidence ledger are updated. | `.afol/wb/<session>/**`. | Done means validated, not merely edited. | Task closes with missing evidence or unresolved warning. |

## Flow

1. Operator or agent checks current project state.
   - Information shown: active session, warnings, stale state, and next action.
   - User or agent decision: continue, catch up, create a governed session, or
     run maintenance review.
   - AFOL command/tool: `afol status`, `afol session radar`, `afol ux list`.
   - System state: read-only projection over workbench and UX registry.
   - Possible failure: stale session or missing registry entry.
   - Recovery: run `afol catchup`, select the session explicitly, or register a
     missing UX journey/backlog.
2. Orchestrator scopes the governed work.
   - Information shown: roadmap feature, parent spec, task id, expected
     validation, and evidence path.
   - User or agent decision: create or reuse a workbench session.
   - AFOL command/tool:
     `afol new <theme> --feature-id <id> --parent-spec <spec-id>` and
     `afol start --session <id> --task-id <task-id>`.
   - System state: task enters `in_progress`; start briefing prints warnings.
   - Possible failure: no parent spec, no explicit task, or stale active
     session.
   - Recovery: create the missing governed artifact or start with explicit
     `--session` and `--task-id`.
3. Orchestrator delegates bounded agent slices.
   - Information shown: objective, repo root, read/write scope, required skill,
     expected files, evidence expectations, and output contract.
   - User or agent decision: use a specialist agent or continue locally.
   - AFOL command/tool: project-local `.agents/skills/ux-design` plus workbench
     session/task context.
   - System state: delegated agents operate read-only or in disjoint write
     scopes and return findings.
   - Possible failure: agent maps commands but not user experience.
   - Recovery: require facts/assumptions/unknowns, touchpoints, recovery paths,
     and evidence in the returned findings.
4. Agent handles maintenance, memory, library, update, or validation work.
   - Information shown: stale review warnings, cleanup needs, conflicts,
     missing fields, scenario issues, token budgets, and dry-run previews.
   - User or agent decision: repair now, backlog explicitly, or ask the user for
     approval when mutation is unsafe.
   - AFOL command/tool: `afol maintenance weekly --dry-run`,
     `afol maintenance monthly --dry-run`,
     `afol maintenance review --area memory --dry-run`,
     `afol maintenance review --area library --dry-run`, `afol memory`,
     `afol library`, `afol update check`, `afol update preview`,
     `afol validate project`, `afol validate bench`, `afol ux validate`.
   - System state: read-only or approved mutation depending on command.
   - Possible failure: warning is not surfaced, output is too large, scenario is
     partial, or evidence is missing.
   - Recovery: tighten output, add scenario metadata, register a journey, or
     record a named backlog item.
5. Agent records evidence and closes.
   - Information shown: command, result, artifact/report path, and residual
     risk.
   - User or agent decision: mark task done, keep open, or add follow-up.
   - AFOL command/tool: `afol evidence`, `afol done`, `afol close`,
     `afol verify-tasks --strict`.
   - System state: evidence ledger and State Board are authoritative.
   - Possible failure: done without evidence, duplicate task state, or stale
     open sessions.
   - Recovery: rerun validation, append evidence, reconcile State Board, then
     close or archive intentionally.

## Agent Journey Matrix

| Journey | Primary agent | Trigger | Expected AFOL tools | Expected result | Missing or weak proof to add |
| --- | --- | --- | --- | --- | --- |
| Bootstrap/onboarding | Maintainer or downstream operator | New project or scaffold refresh | `afol bootstrap`, `afol init`, `afol validate project` | Config, rules, governance docs, and `.agents/skills/ux-design` are present without legacy runtime. | Dedicated post-bootstrap UX journey. |
| Governed task lifecycle | Orchestrator and worker | User asks for non-trivial work | `afol new`, `afol start`, `afol evidence`, `afol done`, `afol close` | Task has roadmap/spec, State Board, evidence, and closure. | Evidence-first journey for validation-heavy tasks. |
| Delegated agent work | Orchestrator and helper agents | Parallel analysis or bounded work | `afol status`, `.agents/skills/ux-design`, workbench session/task context | Handoff names scope, skills, evidence, token budget, and closure gate. | First-class delegated-agent live scenario. |
| Maintenance cadence | Maintenance agent | Weekly/monthly review due | `afol maintenance weekly --dry-run`, `afol maintenance monthly --dry-run`, `afol maintenance review --area <area> --dry-run` | Warnings cover memory, library, sessions, rules, skills, docs, commands, organization, roadmap, specs, and manifest. | Scenario tying weekly review to old-session closure/archive. |
| Memory review | Memory agent | Memory stale, noisy, or empty | `afol memory list`, `afol memory search`, `afol memory propose`, `afol memory promote`, `afol memory reject`, `afol memory archive` | Agent distinguishes recall, proposal, promotion, rejection, cleanup, and retention. | E2E memory plus maintenance cleanup journey. |
| Library review | Library agent | Knowledge topic stale or duplicated | `afol library list`, `afol library topic`, `afol library search`, `afol library propose`, `afol library health`, `afol library doctor` | Agent can find, source, invalidate, rebuild, and diagnose knowledge safely. | `health/doctor` journey after a real authorship failure. |
| Update/scaffold drift | Maintainer | Template, rules, skills, or governance changed | `afol update check`, `afol update preview`, `afol update apply --dry-run` | Changes and conflicts are visible; real apply requires session/task/reason. | Journey starting from real spec/roadmap/manifest change. |
| UX/tool coverage | Reviewer | Production-readiness claim | `afol ux list`, `afol ux show`, `afol ux validate`, `afol ux coverage`, `afol validate bench` | Every covered command has journey/scenario/evidence or explicit backlog. | Live-agent evidence for agent-decision flows. |
| Telemetry/token review | Benchmark agent | Runtime-live benchmark or release review | `afol telemetry query`, `afol telemetry report`, `afol telemetry export`, `afol bench` | Token, tool, latency, command path, and output budget are auditable. | Saved telemetry artifact bound to each live-agent scenario. |
| Session archive/review | Maintenance agent | Many open or stale workbench sessions | `afol session list`, `afol session radar`, `afol local-state rebuild`, `afol close` | Old sessions are reviewed, closed, archived, or carried forward intentionally. | Scenario that starts from maintenance weekly and resolves sessions. |

## Expected Result

- Output: compact command output or JSON names the journey, current state,
  warning/review prompts, expected AFOL tools, evidence paths, and missing
  coverage/backlog when applicable.
- Durable state change: only `new`, `start`, `evidence`, `done`, `close`,
  approved maintenance review mutations, approved update apply, or approved UX
  register operations write state.
- Warning or review prompt: stale session, missing evidence, failed validation,
  old workbench sessions, memory/library cleanup, rules/skills/docs/commands
  review, roadmap/spec/manifest refresh, and excessive output must be visible
  when relevant.
- Token/output budget: compact/default commands should stay under 5,000 output
  tokens; commands over 10,000 output tokens fail benchmark expectations.

## States And Recovery

- Default: agent sees compact status and known journeys before acting.
- Loading or in-progress: `afol start` moves the task to `in_progress` and
  prints briefing context.
- Empty or no results: memory/library/session/UX list commands name the empty
  surface and next safe action.
- Error: validation failures name the exact field, check, scenario, command, or
  missing evidence path.
- Partial failure: partial tool coverage remains explicit backlog, not proof.
- Permission denied or approval required: mutations that can affect governance,
  memory, library, scaffold, or files require approval, dry-run, or
  session/task/reason.
- Stale state: start/status/maintenance/catchup must surface stale workbench or
  review cadence before execution continues.
- Success: task has evidence, validation, updated journey/benchmark metadata
  when relevant, and closed workbench state.
- First use: bootstrap/init installs project-local `ux-design` skill and
  registry docs so agents do not depend on global-only behavior.
- Returning user: maintenance cadence and session review show what changed
  since last work session.

## Evidence

- Scripted scenario:
  `.afol/data/benchmarks/catalog/scenarios/governance-history/tool-surface-coverage-matrix.json`.
- Live-agent scenario:
  `.afol/data/benchmarks/catalog/scenarios/runtime-live-agent/live-governed-task.json`
  and `.afol/data/benchmarks/catalog/scenarios/runtime-live-agent/live-maintenance-cadence.json`.
- Benchmark pack: `afol validate bench --pack runtime-live-agent --json` for
  live-agent behavior and `afol validate bench --pack governance-history --json`
  for coverage metadata.
- Report or workbench evidence:
  `.afol/wb/260627_1611_agent-ux-experience-map/.evidence.jsonl`.

## Metrics

- Completion criterion: `afol ux validate` passes; `afol ux coverage --tool
  maintenance`, `afol ux coverage --tool memory`, `afol ux coverage --tool
  library`, `afol ux coverage --tool session`, and `afol ux coverage --tool
  telemetry` each return a journey or explicit backlog.
- Error/retry criterion: missing required journey fields, missing benchmark
  scenario, missing evidence path, stale warnings, or output-budget violations
  block production-readiness claims.
- User effort or latency criterion: agent can determine next action from
  status/start/maintenance/UX output without manually opening raw state files.
- Support or confusion signal: repeated user questions like "were all tools
  tested?", "did warnings fire?", or "where is the journey?" indicate the UX map
  or evidence is insufficient.
- Quality or review signal: reviewer can trace each claim to a command, source
  file, scenario, result artifact, and closure event.

## Acceptance

- [x] Primary actor and goal are explicit
- [x] Facts, assumptions, and unknowns are separated
- [x] Current and target experience maps are explicit
- [x] Frontstage, backstage, systems, and guardrails are explicit
- [x] Steps, states, failures, and recovery are explicit
- [x] Expected AFOL tools are named
- [x] Expected output and durable state change are explicit
- [x] Evidence path is explicit
