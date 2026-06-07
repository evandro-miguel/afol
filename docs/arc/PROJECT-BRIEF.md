---
doc_type: standard
id: 000000_000000_project-brief_standard_01
status: active
created_at: '2026-03-07T00:00:00Z'
updated_at: '2026-03-06T22:29:30-03:00'
---

# Project Brief

## Purpose

- Provide a canonical, repo-local summary of what this scaffold is for.
- Give operators and runtime adapters one stable product reference without
  creating a second governance tree.

## Product Goal

- This repository is a Bun/TypeScript-first factory for an AGENTS-governed
  development workflow.
- The public downstream CLI is `afol`/`afol`, implemented under `cli/**`.
- The exportable template source is `src/project-template/`.
- Root `.agents/` compatibility surfaces remain in the factory tree during
  migration and are not part of the downstream payload.

## Core Outcomes

- Downstream repos should start from the exportable template payload, not the
  factory-only root `.agents` tree.
- Agents should work from durable artifacts instead of hidden memory.
- Runtime adapters and mirrors should stay thin, secret-free, and traceable to
  canonical `.agents` guidance.

## Canonical Sources

- CLI implementation: `cli/**`
- Template source: `src/project-template/`
- Governance: `AGENTS.md`
- Roadmap: `docs/arc/GENERAL-ROADMAP.md`
- Primary workflow standard: `docs/standards/workflow.md`
