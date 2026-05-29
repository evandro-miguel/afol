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
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - src/project-template
  - .agents/scripts/agents-bootstrap.py
  packages:
  - project-template
risk_level: high
---

# SPEC: minimal-project-template

## 1) Feature Intent

Redesign `src/project-template/` as a minimal local agent-governance template.

The template contains state and protocol files. It does not contain the full CLI
implementation.

## 2) Problem

A copied scaffold can become bloated with implementation code, generated state,
root docs, root workbench history, source seeds, or factory-only tests.

That bloat increases token use, makes updates risky, and leaks factory concerns
into downstream projects.

## 3) Product Boundary

```text
universal CLI = behavior, commands, validation, mutation, update logic
project template = local state, rules, skills, workbench, specs, evidence
```

The template must remain usable while legacy Python/Bash compatibility exists,
but it should converge toward invoking the universal Bun/TypeScript CLI through
`./a`.

## 4) Required Template Shape

```text
src/project-template/
├── a
├── AGENTS.md
├── .agents/
│   ├── config.json
│   ├── lock.json
│   ├── manifest.json
│   ├── wb/
│   │   └── README.md
│   ├── rules/
│   ├── skills/
│   ├── data/
│   │   ├── events/
│   │   └── index/
│   └── tmp/
└── docs/
    └── arc/
        ├── GENERAL-ROADMAP.md
        └── SPECS/
            └── README.md
```

## 5) State Model

Required local files:

| File | Owner | Purpose |
| --- | --- | --- |
| `./a` | managed | local wrapper into CLI/fallback |
| `.agents/config.json` | project | local feature flags and paths |
| `.agents/lock.json` | managed | CLI/template version lock |
| `.agents/manifest.json` | managed | managed file hashes and ownership |
| `.agents/wb/` | project | sessions, tasks, logs, evidence |
| `.agents/rules/` | project | local rules and routing metadata |
| `.agents/skills/` | project | local skills and metadata |
| `.agents/data/` | generated | indexes, events, benchmark results |
| `AGENTS.md` | project | runtime instruction front door |
| `docs/arc/` | project | minimal goal-state governance |

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
- Local wrapper.
- Bootstrap copy rules.
- Export cleanliness tests.

Out of scope:

- Global CLI implementation.
- Full public release polish.
- Migrating every legacy script immediately.

## 9) Acceptance

- Template contains every required local protocol file.
- Template excludes factory noise.
- Export checks fail on forbidden content.
- Downstream bootstrap can run `./a -h` and `./a s`.
- Update preview can classify managed vs project-owned files.
- Agents can start governed work without reading root factory docs.

## 10) Closure

- Accepted implementation evidence: `E-20260529135617802715`.
- Closeout session: `.agents/wb/260529_1350_f02-template-export-alignment/`
- Strict verification:
  `./.agents/agents verify-tasks --strict .agents/wb/260529_1350_f02-template-export-alignment/`
  passed.
