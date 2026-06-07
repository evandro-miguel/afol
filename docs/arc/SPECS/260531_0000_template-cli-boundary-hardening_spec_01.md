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

2026-05-31 DR addendum:

- The boundary hardening is additive to the staged reformulation; do not replace
  existing F-00/F-01/F-02 sequencing.
- F-02 hard requirement: downstream `src/project-template` and bootstrap output
  must stay free of Python/uv/scripts/runtime payload and other factory-only
  command surfaces.

## 3) Architecture Impact

Do not port Python legacy line-for-line.

Use Bun-native CLI behavior as the canonical implementation, with the template
as a downstream state and policy boundary only.

The CLI core owns registry, router, result envelope, project-root detection, and
schema loading. The generated template module exists to support the exported
baseline, but the factory runtime remains outside `src/project-template/` until
TypeScript parity is proven.

Safe-retirement rule:
factory-only Python/legacy compatibility paths remain in root factory state only
as migration fallbacks and are retired only after delegated command families are
covered by native TypeScript implementations and gate evidence confirms a safe
transition.

Provider-specific lifecycle hooks follow the same boundary. Codex hooks,
wrapper scripts, MCP-triggered events, or future provider adapters belong to
CLI/factory behavior. The template may carry only provider-neutral policy,
manifest, lock, and local state needed by the CLI to interpret those events.

## 4) Product Boundary

```text
universal CLI = registry, router, result envelope, project-root detection, schemas
project template = local state, manifest, lock, rules, skills, workbench, docs, evidence
```

The template may carry only policy and manifest files needed for bootstrap and
local governance.
It must not carry factory runtime, legacy Python command surfaces, or
development-only scripts.

Template boundary tests are the first-class anti-pollution control:

- `template-policy` detects forbidden paths and forbidden legacy runtime references.
- Bootstrap/export negative tests must fail on `.py`, `uv.lock`, `.venv`,
  `pyproject.toml`, `.agents/scripts`, `.agents/runtime`, `.agents/agents`,
  and `.agents/agents-mcp`.

Lifecycle-event support must not become a reason to export provider-specific
hook runtimes into `src/project-template/`. Downstream installs should receive
state and configuration only; `afol lifecycle event` remains universal CLI
behavior.

Related spec: `260521_0010_universal-agent-cli_spec_01`

## 5) Scope

In scope:

- Template boundary checks.
- Bootstrap allowlist behavior.
- Generated template module presence.
- CLI core ownership of registry, router, result, project-root, and schema.
- Verification for template and bootstrap clean state.
- Policy/manifest allowance for provider-neutral lifecycle behavior, if needed
  by the CLI contract.
- Retirement evidence rule: root legacy command surfaces remain active until
  native parity is proven for each delegated family; explicit removal is outside
  the in-scope cleanup.

Out of scope:

- Reimplementing legacy Python commands verbatim.
- Reimplementing every legacy command family in this hardening stream.
- Deleting factory runtime surfaces before TypeScript parity exists.
- Expanding downstream template beyond state-only needs.
- Moving factory runtime into exported template paths.
- Shipping Codex-specific hook code, wrapper scripts, or long-lived provider
  runtimes as downstream template payload.

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
- `bun run build`
- `bun run smoke:dist` (or equivalent standalone build smoke path)
- Export checks confirm only allowlisted policy and manifest files copy.
- Export checks reject the forbidden paths listed above.

## 8) Rollout and Backout

Rollout keeps factory runtime only in the repo-local development surface until
TypeScript parity covers the template boundary.

Backout is to preserve the compatibility runtime outside downstream template
paths and keep the legacy flow available until the Bun-native boundary is
proven.

Retirement condition:
`.agents/agents`, `.agents/scripts`, and `.agents/runtime` are only retired by
a dedicated cleanup stream after all delegated command families are proven native and
all gate evidence (`validate:template`, `validate:bootstrap`) passes.

## 9) Acceptance

- `src/project-template` contains no `.py`, `.agents/scripts`, `.agents/runtime`,
  `.agents/agents`, `.agents/agents-mcp`, `pyproject.toml`, `uv.lock`, or
  `.venv`.
- Template-boundary failures are hard gates in CI-style smoke and template checks.
- Root factory legacy compatibility paths (`.agents/agents`, `.agents/scripts`,
  `.agents/runtime`) are not declared removed in this stream; they remain until
  full native replacement for all delegated command families is complete.
- Bootstrap copies only the allowlisted policy and manifest files.
- The generated template module exists and resolves cleanly.
- CLI core owns registry, router, result envelope, project-root detection, and
  schema loading.
- Bun tests, typecheck, `validate:template`, and `validate:bootstrap` pass.
- Factory runtime remains only outside downstream template until TS parity is
  complete.
- Provider hook support, when added, does not expand the template beyond
  state-only policy, manifest, lock, and local governance files.
- `afol` is the canonical front door; `afol` remains compatibility/local wrapper
  during migration.

## 10) Hermes Benchmark Decisions

- Pattern: keep the CLI/template boundary contract-driven.
- Hermes source concept: mature registry/tool specs separate runtime behavior
  from project state.
- Local decision: adapt the contract discipline, but reject copying Hermes as a
  product, gateway runtime, or monorepo.
- Acceptance criteria: template export remains free of factory-only runtime,
  scripts, caches, and legacy Python payloads; CLI registry and result handling
  remain the canonical behavior surface.
- Non-goals: no downstream runtime clone, no lazy vendor install, no raw
  browser/CDP control in the template.

## 11) Related Specs

- Parent boundary: `260521_0020_minimal-project-template_spec_01`
- CLI foundation: `260521_0010_universal-agent-cli_spec_01`
