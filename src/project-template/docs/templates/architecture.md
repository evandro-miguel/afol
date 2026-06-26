---
doc_type: architecture
id: "ARCHITECTURE_root"
status: active
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---

# ARCHITECTURE

## 1) Mission

- <what this repo exists to ship>

## 2) Principles

- Correctness first
- Proof over claims
- Small diffs
- Stable interfaces
- Progressive disclosure docs

## 3) Repo Boundaries

In scope:

- <in>

Out of scope:

- <out>

## 4) High-level System Map

Modules:

- <module> at <path> responsibilities: <short>

Data flow:

1) <source> -> <process> -> <sink>

## 5) Layering Rules

Layers:

- Layer A: <definition>
- Layer B: <definition>

Allowed dependencies:

- A -> B
- B -> C

Forbidden dependencies:

- C -> A
- UI -> DB directly

## 6) Directory Map

- <dir> -> <purpose>
- <dir> -> <purpose>

## 7) Public Interfaces

- API endpoints:
  - <endpoint> contract: <input/output>

- Internal interfaces:
  - <interface> location: <path>

## 8) Data and Storage

Primary stores:

- <store> purpose: <why>

Constraints:

- Migrations policy: <rules>
- Backups policy: <rules>

## 9) Configuration

Source of truth:

- <file> for <scope>

Precedence:

1) <highest>
2) <...>
3) <lowest>

## 10) Security

Non-negotiables:

- Never log secrets
- Never commit secrets
- Least privilege
- Sandbox risky tools

## 11) Observability

Logs:

- Required events:
  - <event>

Metrics:

- Required metrics:
  - <metric>

## 12) Testing Strategy

Fast checks:

- Lint
- Typecheck
- Unit

Confidence checks:

- Integration
- E2E

Gates:

- What must pass before merge:
  - <list>

## 13) Change Policy

- No mixed refactor + feature unless necessary
- Feature flags for risky changes
- ADR required for:
  - new core dependency
  - new architecture layer
  - breaking interface change

## 14) References

- `.afol/adm/roadmap.md`
- `.afol/adm/specs/`
- `.afol/adm/decisions/`
- `.afol/adm/doctrine.md`

---

*Template: `docs/templates/architecture.md`*
