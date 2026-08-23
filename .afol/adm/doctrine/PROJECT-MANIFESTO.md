---
doc_type: manifesto
id: 260521_0000_project_manifesto_01
status: active
owners:
- orchestrator
created_at: '2026-05-21T00:00:00+08:00'
updated_at: '2026-06-14T00:00:00-03:00'
---

# PROJECT MANIFESTO

## 1) Thesis

AFOL is a layered local execution OS for agents: Markdown/YAML keeps human and
agent interaction readable; SQLite materializes execution state for speed; IWE
can power curated library retrieval; memory preserves compact project
continuity; specs/ADRs govern decisions; evidence proves completion; context
bundles give each agent only what it needs.

This project is a universal governance and execution template for AI agents.

Its purpose is to let agents work across projects with the same structure, same
commands, same rules, same workbench logic, same update flow, and the same
low-token operating model.

The core product is not a documentation folder.

The core product is an agent operating layer.

## 2) Decision-Mother and Product Definition

Decision-mother: **CLI = engine/motor, template = editable save file/state**.

The universal CLI owns behavior.
The template owns project-local mutable state.

```text
CLI = code, commands, validation, bootstrap/update, tests, safety,
      mutation logic, local-state indexing
Template = Markdown + JSON config, rules, skills, workbench,
           evidence/logs/specs, editable local state
```

Direction update: project administration now lives under `.afol/adm/**` and
`docs/arc/**` is a frozen transitional archive preserved for reversibility.
See ADR-005. Project structure maps, when generated, remain under
`.afol/pstr/**`.

AFOL separates project direction from project structure.

`.afol/adm` defines what the project should become. `.afol/pstr` maps what the
project currently is. Agents use `adm` to understand intent, `pstr` to
understand where to work, `wb` to execute, memory to preserve continuity, and
library to access curated external knowledge.

The final system should allow agents to enter any project that uses this template
and immediately know how to plan, create specs, execute tasks, update logs, mark
work done, resolve rules, manage skills, save research, mutate files, validate
closure, and keep project state current.

## 3) Product Surface

The exported project baseline lives under `src/project-template/`.

This is the template installed into downstream projects. It should be minimal,
clear, and updateable. It should not contain root development history, root
workbench noise, root-only maps, root-only tests, or internal maintenance
artifacts.

## 4) Factory Surface

The root repository is the factory. It contains strategy docs, roadmap, specs,
development workbench, validation tests, release tooling, template source,
migration tooling, bootstrap tooling, and experiments.

The factory exists to build and validate the product. The factory is not the
product installed into downstream projects.

## 5) Core Principles

### 5.1 Low-token execution

Every common agent action should avoid unnecessary file reads and writes. Agents
should use commands instead of manually editing routine state.

### 5.2 File-first, chat-light

Durable work belongs in files. Chat should contain compact handoffs. Subagents
should save detailed research, logs, and findings into the session folder, then
return only a summary and path to the orchestrator.

### 5.3 CLI-first governance

The system should expose a short command interface for high-frequency agent
operations. Human-readable long aliases may exist, but agent-facing commands
should prefer compact names.

### 5.4 Universal but local

The system must work across projects. Each project must still keep its own local
rules, skills, workbench, specs, evidence, and configuration.

### 5.5 Smart context delivery

Agents should not load every rule or every skill. The system should route only
the relevant rules and skills based on touched surface, task type, file paths,
and work intent.

### 5.6 Type-safe core

Bun and TypeScript should become the heart of the system. The final architecture
should use typed models and schemas for sessions, tasks, specs, rules, skills,
evidence, logs, file mutations, events, updates, and command results.

### 5.7 Reversible mutation

Agents should not mutate project files blindly. File writes, moves, archives,
patches, and generated artifacts should be tracked with enough metadata to
inspect, verify, and undo when possible.

### 5.8 Downstream boundary discipline

The template is editable project state, not runtime implementation.

Template payload excludes:

- `.agents/scripts`
- `.agents/runtime`
- `.agents/agents`
- a project-local `afol` executable, wrapper, symlink, package bin, or command
  runner
- Python/uv payload
- factory-only tests
- tool internals

### 5.9 Minimalism by default

The template must stay lean. Every file, command, rule, skill, and doc must
justify its existence by reducing agent friction, reducing token usage,
improving safety, or improving updateability.

### 5.10 Updateable project system

Every downstream project should be able to check for updates, preview changes,
apply compatible updates, detect conflicts, and preserve local project-specific
edits.

### 5.11 Public-ready design

The system should start as a personal tool but be designed for future public
use: clear boundaries, simple onboarding, predictable commands, no
machine-specific assumptions, no hidden private dependencies, and no unnecessary
complexity.

### 5.12 Administrative onion

The system should behave like an onion:

- inner doctrine and authority change rarely and require ADR,
- contracts and schemas change through specs and tests,
- hydration/projection engines connect canonical Markdown/YAML with materialized
  execution state,
- domain services own workbench, memory, library, context, spec, ADR, and audit
  behavior,
- providers such as IWE remain replaceable outer layers.

Target project-local administration surfaces:

- `.afol/adm/` owns desired-state administration: manifesto, roadmap, specs,
  ADRs, changelog, archive, and policy.
- `.afol/pstr/` owns generated observed project-structure map outputs when
  present. Current AFOL emits flat area maps (`index.json`, `cli.md`,
  `template.md`, `docs.md`, `config.md`) from the PSTR area registry. Missing
  or stale maps are descriptive state, not authority.
- `.afol/state/afol.db` owns SQLite materialization and query cache.
- `.afol/adm/**` is the canonical administration surface; `docs/arc/**` is the
  frozen transitional archive preserved by ADR-005.

Rule of gold:

```text
pstr describes what exists.
adm defines what should exist.
wb executes change.
```

`.afol/pstr/**` must not contain scripts, task execution, automations, roadmap,
spec acceptance, future planning, or governance decisions. Commands that build
or validate maps live in `cli/**`; only their map outputs live in `.afol/pstr`.

### 5.13 Time-aware durability

AFOL must treat time as first-class state. Every durable artifact that can guide
an agent must declare when it was created, updated, reviewed, and when it should
be considered stale.

Default policies:

- Time policy: canonical files use ISO UTC timestamps; branch and commit are
  recorded when an artifact depends on repository state.
- Freshness policy: stale pstr maps, stale SQLite materialization, stale memory,
  and stale library research do not enter context bundles as trusted inputs.
- Health policy: `afol health` is fast by default, JSON-capable, and reports
  `fail`, `warn`, and `info` severities.
- Cleanup policy: archive by metadata before moving files; preserve stable refs.
- Token budget policy: context bundles start with refs and summaries, then
  expand exact sections only on demand.

### 5.14 Brain layer, not brain product

AFOL should borrow brain-system patterns without becoming a heavy personal or
company brain product.

Copy the patterns:

- Markdown/YAML source of record.
- SQLite materialization.
- AFOL shape/schema pack.
- Hybrid retrieval over exact paths, FTS, section refs, graph refs, freshness,
  and authority.
- Context bundles with citations, why, gaps, stale warnings, and do-not-load.
- Sweep/doctor cycles for cleanup and remediation.
- Resolver-based routing for rules, skills, tools, pstr, memory, and library.
- Trust boundary for local, agent, and remote callers.

Do not copy now:

- always-on daemon,
- multi-user company brain,
- mandatory OAuth,
- mandatory Postgres/pgvector,
- aggressive auto-ingest,
- remote schema mutation or admin surfaces.

## 6) Non-Goals

This project should not become a generic coding agent, a project management
SaaS, a long-lived backend service by default, a docs-heavy bureaucracy, a
giant framework, a copied implementation blob, a heavy-governance mandate for
small tasks, an untraceable file editor, or a template that leaks factory
state.

## 7) Target Architecture

```text
global/universal layer
- agentic CLI implemented in Bun/TypeScript
- command router, typed schemas, workbench engine
- rules engine, skills engine, file mutation engine
- update engine, validation engine, runtime/MCP adapters
- template-policy scanner and validator

project-local layer
- .afol/config.json
- .agents/lock.json
- .agents/manifest.json
- .agents/skills
- .afol/adm, .afol/pstr, .afol/wb, .afol/state, rules, skills, data, tmp

external operator layer
- afol command provided outside the target project
```

The public command entrypoint is the external operator command `afol`.
The root `./afol` file is a factory development and package entrypoint only.
It is not part of the downstream project payload and must not replace the
globally installed executable contract.
Retired `.agents/agents`, `agents.config`, and `legacy:` routes are not
compatibility front doors.

## 8) Command Philosophy

The routine operator command is `afol`, installed outside the target project.
Factory development may invoke root `./afol`, `bun run kernel`, or
`./dist/afol`; downstream projects receive no local executable or command
runner.

High-frequency commands have short aliases through `afol`; these examples use
explicit forms where argument names matter:

- `afol s`
- `afol new auth-refactor --feature-id F-02 --parent-spec auth-spec`
- `afol start --task-id T-01`
- `afol done --task-id T-01 --test "bun test"`
- `afol log --session <session-id> --message "Added validation"`
- `afol evidence --task-id T-01 --command "bun test" --result passed`
- `afol rule resolve --surface frontend --work-type delivery`
- `afol skill list`
- `afol qt <theme> -t "Summarize research" -c "bun test"`
- `afol validate project`
- `afol close`
- `afol update check`

Long aliases may exist for humans. Agents should prefer short commands.
Retired aliases do not return as command front doors.

## 9) Quality Bar

A system feature is acceptable only if it answers what friction it removes,
what token cost it reduces, what recurring error it prevents, what typed contract
it creates, what local state it reads or writes, what validation proves it works,
how it can be updated, and how it fails safely.

## 10) Long-Term Vision

The final product is a universal local operating system for AI-agent work. It
should make every project feel familiar to every supported agent. The system
should be small, typed, fast, and safe.

The workshop builds the machine. The template ships the machine. The CLI powers
the machine. The project owns its state.
