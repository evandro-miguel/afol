---
doc_type: manifesto
id: 260521_0000_project_manifesto_01
status: active
owners:
- orchestrator
created_at: '2026-05-21T00:00:00+08:00'
updated_at: '2026-05-21T00:00:00+08:00'
---

# PROJECT MANIFESTO

## 1) Thesis

This project is a universal governance and execution template for AI agents.

Its purpose is to let agents work across projects with the same structure, same
commands, same rules, same workbench logic, same update flow, and the same
low-token operating model.

The core product is not a documentation folder.

The core product is an agent operating layer.

## 2) Product Definition

The product is a minimal local project protocol plus a universal CLI.

The local project keeps state.

The universal CLI owns behavior.

This separation is mandatory.

~~~text
universal CLI = logic, commands, validation, updates, file operations
local project = config, rules, skills, specs, workbench, evidence, logs, state
~~~

The final system should allow agents to enter any project that uses this
template and immediately know how to plan, create specs, execute tasks, update
logs, mark work done, resolve rules, manage skills, save research, mutate files
safely, validate closure, and update the local agent system.

## 3) Product Surface

The exported project baseline lives under src/project-template/.

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

Example: ./a t d T-01 -e E-01 instead of opening a task file, reading it,
editing it, and rewriting it.

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

### 5.8 Updateable project system

Every downstream project should be able to check for updates, preview changes,
apply compatible updates, detect conflicts, and preserve local project-specific
edits.

### 5.9 Minimalism by default

The template must stay lean. Every file, command, rule, skill, and doc must
justify its existence by reducing agent friction, reducing token usage,
improving safety, or improving updateability.

### 5.10 Public-ready design

The system should start as a personal tool but be designed for future public
use: clear boundaries, simple onboarding, predictable commands, no
machine-specific assumptions, no hidden private dependencies, and no unnecessary
complexity.

## 6) Non-Goals

This project should not become a generic coding agent, a project management
SaaS, a long-lived backend service by default, a docs-heavy bureaucracy, a giant
framework, a copied implementation blob, a heavy-governance mandate for small
tasks, an untraceable file editor, or a template that leaks factory state.

## 7) Target Architecture

~~~text
global/universal layer
- agentic CLI implemented in Bun/TypeScript
- command router, typed schemas, workbench engine
- rules engine, skills engine, file mutation engine
- update engine, validation engine, runtime/MCP adapters

project-local layer
- .agents/config.json
- .agents/lock.json
- .agents/manifest.json
- .agents/wb, rules, skills, specs, data, tmp

project wrapper
- ./a
~~~

## 8) Command Philosophy

The local wrapper should be ./a.

High-frequency commands should use short names:

- ./a s
- ./a n auth-refactor -F F-02 -S auth-spec
- ./a t s T-01
- ./a t d T-01 -e E-01
- ./a l a -t T-01 -m "Added validation"
- ./a e a -t T-01 -c "bun test" -r pass
- ./a r g frontend
- ./a sk u
- ./a q s -t T-02 -f research.md -m "Summary"
- ./a v
- ./a c
- ./a up ck

Long aliases may exist for humans. Agents should prefer short commands.

## 9) Quality Bar

A system feature is acceptable only if it answers what friction it removes, what
token cost it reduces, what recurring error it prevents, what typed contract it
creates, what local state it reads or writes, what validation proves it works,
how it can be updated, and how it fails safely.

## 10) Long-Term Vision

The final product is a universal local operating system for AI-agent work. It
should make every project feel familiar to every supported agent. The system
should be small, typed, fast, and safe.

The workshop builds the machine. The template ships the machine. The CLI powers
the machine. The project owns its state.
