---
doc_type: spec
id: 260521_0020_minimal-project-template_spec_01
theme: minimal-project-template
status: final
owners:
- orchestrator
created_at: '2026-05-21T00:20:00+08:00'
updated_at: '2026-05-29T14:10:48-03:00'
roadmap_feature: F-02
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - src/project-template
  - cli/schemas/template-policy.ts
  packages:
  - project-template
risk_level: high
---

# SPEC: minimal-project-template

## 1) Feature Intent

Redesign `src/project-template/` as a minimal local agent-governance template.

The template contains state and protocol files. It does not contain the full CLI
implementation.

2026-05-31 DR addendum:

- Keep `.agents` state and governance files minimal and downstream-safe.
- F-02 boundary is explicit: no Python/uv/scripts/runtime payload in exported
  template content.

## 2) Problem

A copied scaffold can become bloated with implementation code, generated state,
root docs, root workbench history, source seeds, or factory-only tests.

That bloat increases token use, makes updates risky, and leaks factory concerns
into downstream projects.

## 3) Product Boundary

```text
external `afol` CLI = behavior, commands, validation, mutation, update logic
project template = config metadata, rules, skills, governance docs, state dirs
```

Downstream projects receive config, governance, provider metadata, skills,
template docs, and AFOL-owned state directories only. They must not receive a
project-local `afol` executable, wrapper, symlink, package bin, command runner,
legacy Python runtime, or Bash compatibility surface.

`afol` remains the canonical command in runtime-facing workflows, but it is an
external operator command supplied outside the target project.

## 4) Required Template Shape

```text
src/project-template/
├── AGENTS.md
├── RTK.md
├── .agents/
│   ├── config.json
│   ├── lock.json
│   ├── manifest.json
│   ├── skills/
│   │   └── README.md
├── .afol/
│   ├── adm/
│   │   ├── architecture.md
│   │   ├── doctrine.md
│   │   ├── roadmap.md
│   │   └── tools.json
│   ├── data/
│   │   └── README.md
│   ├── library/
│   │   ├── GRAPH.md
│   │   ├── INDEX.md
│   │   └── TAGS.md
│   ├── memory/
│   │   └── memory.md
│   ├── pstr/
│   │   └── README.md
│   ├── tmp/
│   │   └── README.md
│   └── wb/
│       └── README.md
└── docs/
    ├── lessons/
    │   └── README.md
    ├── telemetry/
    │   └── README.md
    └── templates/
        └── *.md
```

## 5) State Model

Required local files:

| File | Owner | Purpose |
| --- | --- | --- |
| `.agents/config.json` | project-owned | local feature flags and paths |
| `.agents/lock.json` | project-owned | template revision lock and downstream identity |
| `.agents/manifest.json` | project-owned | ownership contract and allowed payload paths |
| `.afol/wb/` | project-owned | sessions, tasks, logs, evidence |
| `.afol/adm/` | project-owned | desired-state governance and static hook/rule metadata |
| `.agents/skills/` | project-owned | local skills and metadata |
| `.afol/data/` | generated | indexes, events, benchmark results |
| `.afol/pstr/` | generated | current-state structure maps only |
| `.afol/tmp/` | ignored | AFOL temporary runtime state |
| `.afol/library/` | project-owned | project-local knowledge graph files |
| `.afol/memory/` | project-owned | project-local memory seed files |
| `docs/templates/` | project-owned | reusable workflow artifact templates |
| `docs/lessons/` | project-owned | lessons index and downstream lesson entries |
| `AGENTS.md` | project-owned | runtime instruction front door |
| `RTK.md` | project-owned | optional local token-output policy |

Manifest ownership classes:

```text
managed
project-owned
generated
ignored
conflict
```

Update and export code must never treat project-owned files as blindly
replaceable.

## 6) Forbidden Exported Content

The template must not export:

- root workbench history,
- root telemetry events,
- root development maps,
- root tests,
- caches,
- local virtual environments,
- private machine paths,
- credentials or `.env` files,
- source seeds not required at runtime,
- broad factory docs,
- factory-only implementation experiments.
- legacy Python/Bash/uv wrapper surfaces, including `.agents/scripts`, `.agents/runtime`, `.agents/agents`, `.agents/agents-mcp`.

## 7) Export Rules

- Export is manifest-driven.
- Forbidden-path checks run before publishing a template.
- Negative tests must prove known factory-noise paths are rejected.
- Bootstrap must preserve project-owned downstream edits.
- Generated indexes may be created locally but should not be required to ship
  with root history.

## 8) Scope

In scope:

- Template folder shape.
- Minimal local docs.
- Config, lock, and manifest files.
- Bootstrap copy rules.
- Export cleanliness tests.
- Export policy and diff preview requirements from F-09 (`managed` / `project-owned` / `generated` / `ignored` / `conflict`).
- Local-state shape that supports F-07 JSONL event and index contracts.

Out of scope:

- Global CLI implementation.
- Full public release polish.
- Migrating every legacy script immediately.

DR-specific exclusions:

- Source seeds and generated history remain optional and only included when bootstrap
  consumes them; they must not replace project-owned edits.

## 9) Acceptance

- Template contains every required local protocol file.
- Template excludes factory noise.
- Export checks fail on forbidden content.
- Downstream bootstrap can run `afol -h` and `afol s`.
- Update preview can classify managed vs project-owned files.
- Agents can start governed work without reading root factory docs.

## 10) Closure

- Accepted implementation evidence: `E-20260529135617802715`.
- Closeout session: `.afol/wb/260529_1350_f02-template-export-alignment/`
- Strict verification:
  `./.agents/agents verify-tasks --strict .afol/wb/260529_1350_f02-template-export-alignment/`
  passed.
