---
doc_type: index
id: docs_index
status: active
created_at: '2026-06-17T00:00:00Z'
updated_at: '2026-06-17T08:38:34-03:00'
---

# Documentation Index

This repository is AFOL-only. Use this index to find the canonical
documentation surface without falling back to retired `.agents` runtime paths.

## Canonical Authority

- `README.md`: operator front door and high-level command surface.
- `AGENTS.md`: repository instruction contract for agent runtimes.
- `.afol/adm/doctrine/PROJECT-MANIFESTO.md`: product direction and operating doctrine.
- `.afol/adm/doctrine/ARCHITECTURE.md`: architecture authority and boundary rules.
- `.afol/adm/roadmap/GENERAL-ROADMAP.md`: feature inventory and roadmap status.
- `.afol/adm/specs/`: desired behavior, constraints, and acceptance.
- `.afol/adm/decisions/`: ADRs and durable decisions.

## Current Project Structure

- `.afol/pstr/index.json`: generated index of current project-structure maps.
- `.afol/pstr/cli.md`: current CLI structure map.
- `.afol/pstr/template.md`: current export-template structure map.
- `.afol/pstr/docs.md`: current documentation structure map.
- `.afol/pstr/config.md`: current config and metadata structure map.

Do not edit `.afol/pstr/**` by hand. Regenerate it through AFOL when the
observed structure changes.

## Runtime And Execution

- `docs/afol-runtime-reference.md`: command groups, runtime state ownership,
  and validation gates.
- `PLANS.md`: ExecPlan requirements for governed workbench sessions.
- `.afol/wb/**`: active and historical execution sessions.
- `.afol/adm/doctrine/RELEASE-RUNBOOK.md`: release readiness and publish gates.

## Support Docs

- `docs/standards/README.md`: reusable workflow, bootstrap, runtime,
  verification, and process standards.
- `docs/templates/`: starter artifact templates.
- `docs/patterns/`: success and anti-pattern examples.
- `docs/knowledge/`: low-token lookup index for prior workbench knowledge.
- `docs/lessons/`: durable lessons extracted from completed work.
- `docs/telemetry/`: telemetry notes and reports.
- `docs/audits/`: repository hygiene and documentation alignment audits.

## Retired Surfaces

Do not use, document as current, restore, or extend:

- `.agents/agents`
- `.agents/scripts/**`
- `.agents/runtime/**`
- `.agents/wb/**`
- `.agents/z-arq/**`
- `agents.config`
- `docs/map/**` as a root current-state map surface
- `docs/arc/**` as the live governance authority

`.agents/**` remains only static scaffold metadata (`config.json`,
`lock.json`, `manifest.json`) and provider skill content under
`.agents/skills/**`. Hooks, rules, source seeds, and mutable state belong under
`.afol/**`.
