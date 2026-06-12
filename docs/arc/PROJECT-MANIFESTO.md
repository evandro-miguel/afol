---
doc_type: manifesto
id: 260521_0000_project_manifesto_01
status: active
owners:
- orchestrator
created_at: '2026-05-21T00:00:00+08:00'
updated_at: '2026-06-12T13:37:19-03:00'
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

Direction update: project administration should move from `docs/arc/**` to
`.afol/adm/**` through an AFOL-managed migration. Current project structure
evidence and maps should move from ad hoc map docs into `.afol/pstr/**`.
`docs/arc/**` remains the current canonical administration surface until AFOL
ships migration, hydration, drift validation, and index checks for `.afol/adm`.

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
- `.afol/pstr/` owns present-state project structure: maps, inventories,
  generated structure evidence, and rebuildable current-state snapshots.
- `.afol/state/afol.db` owns SQLite materialization and query cache.
- `docs/arc/**` is the current transitional administration surface until the
  AFOL migration is implemented and validated.

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
- .agents/config.json
- .agents/lock.json
- .agents/manifest.json
- .afol/adm, .afol/pstr, .afol/wb, .afol/state, rules, skills, data, tmp

project wrapper
- afol (local compatibility alias during migration)
```

The public command entrypoint is `afol`.
`afol` is the local migration wrapper/compatibility alias.

## 8) Command Philosophy

The local wrapper is `afol` while migration is active.

High-frequency commands should use short names through `afol`:

- `afol s`
- `afol n auth-refactor -F F-02 -S auth-spec`
- `afol st -T T-01`
- `afol d -T T-01 -x "bun test"`
- `afol l -T T-01 -m "Added validation"`
- `afol e -T T-01 -c "bun test" -r pass`
- `afol r g frontend`
- `afol sk u`
- `afol q s -T T-02 -f research.md -m "Summary"`
- `afol v`
- `afol c`
- `afol up ck`

Long aliases may exist for humans. Agents should prefer short commands.
`afol` remains a local compatibility alias where migration requires it.

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
