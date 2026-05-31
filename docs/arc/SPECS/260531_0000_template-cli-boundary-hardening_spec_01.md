---
doc_type: spec
id: 260531_0000_template-cli-boundary-hardening_spec_01
theme: template-cli-boundary-hardening
status: active
owners:
- orchestrator
created_at: '2026-05-30T21:47:00-03:00'
updated_at: '2026-05-30T21:49:00-03:00'
roadmap_feature: F-02
spec_role: parent
parent_spec: 260521_0020_minimal-project-template_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - src/project-template
  - cli
  - .agents/scripts
  - .agents/runtime
  - .agents/agents
  - .agents/agents-mcp
risk_level: high
---

# SPEC: template-cli-boundary-hardening

## 1) Objective

Harden the boundary between the Bun/TypeScript universal CLI and the clean
local template.

The CLI owns command behavior and typed state loading. The exported template
stays state-only and does not inherit factory runtime surfaces.

## 2) Problem

The migration path still risks copying legacy Python behavior into the template
or treating downstream projects as full runtime clones.

That blurs ownership, increases bootstrap payload, and makes the template harder
to reason about than a state-only scaffold.

## 3) Architecture Impact

Do not port Python legacy line-for-line.

Use Bun-native CLI behavior as the canonical implementation, with the template
as a downstream state and policy boundary only.

The CLI core owns registry, router, result envelope, project-root detection, and
schema loading. The generated template module exists to support the exported
baseline, but the factory runtime remains outside `src/project-template/` until
TypeScript parity is proven.

## 4) Product Boundary

```text
universal CLI = registry, router, result envelope, project-root detection, schemas
project template = local state, manifest, lock, rules, skills, workbench, docs, evidence
```

The template may carry only policy and manifest files needed for bootstrap and
local governance.
It must not carry factory runtime, legacy Python command surfaces, or
development-only scripts.

Related spec: `260521_0010_universal-agent-cli_spec_01`

## 5) Scope

In scope:

- Template boundary checks.
- Bootstrap allowlist behavior.
- Generated template module presence.
- CLI core ownership of registry, router, result, project-root, and schema.
- Verification for template and bootstrap clean state.

Out of scope:

- Reimplementing legacy Python commands verbatim.
- Reimplementing every legacy command family in this hardening stream.
- Deleting factory runtime surfaces before TypeScript parity exists.
- Expanding downstream template beyond state-only needs.
- Moving factory runtime into exported template paths.

## 6) Non-goals

- No line-for-line Python compatibility rewrite.
- No export of `.agents/scripts`, `.agents/runtime`, `.agents/agents`, or
  `.agents/agents-mcp` into downstream template.
- No export of `pyproject.toml`, `uv.lock`, or `.venv` into downstream template.

## 7) Verification Plan

- `bun test`
- `bun run typecheck`
- `bun run validate:template`
- `bun run validate:bootstrap`
- Export checks confirm only allowlisted policy and manifest files copy.
- Export checks reject the forbidden paths listed above.

## 8) Rollout and Backout

Rollout keeps factory runtime only in the repo-local development surface until
TypeScript parity covers the template boundary.

Backout is to preserve the compatibility runtime outside downstream template
paths and keep the legacy flow available until the Bun-native boundary is
proven.

## 9) Acceptance

- `src/project-template` contains no `.py`, `.agents/scripts`, `.agents/runtime`,
  `.agents/agents`, `.agents/agents-mcp`, `pyproject.toml`, `uv.lock`, or
  `.venv`.
- Bootstrap copies only the allowlisted policy and manifest files.
- The generated template module exists and resolves cleanly.
- CLI core owns registry, router, result envelope, project-root detection, and
  schema loading.
- Bun tests, typecheck, `validate:template`, and `validate:bootstrap` pass.
- Factory runtime remains only outside downstream template until TS parity is
  complete.

## 10) Related Specs

- Parent boundary: `260521_0020_minimal-project-template_spec_01`
- CLI foundation: `260521_0010_universal-agent-cli_spec_01`
