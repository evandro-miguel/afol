---
doc_type: spec
id: 260627_1655_canonical-afol-configuration-rehome_spec_01
theme: canonical-afol-configuration-rehome
status: planned
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define the canonical AFOL configuration rehome from provider metadata into `.afol/config.json`.
created_at: '2026-06-27T16:55:00-04:00'
updated_at: '2026-06-27T16:55:00-04:00'
roadmap_feature: F-19
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - .afol/config.json
  - .agents/config.json
  - cli
  - src/project-template
  - .afol/adm/tools.json
  packages:
  - agentic-cli
risk_level: high
---

# Canonical AFOL Configuration Rehome

## Intent

Move AFOL-owned operational configuration out of provider-facing `.agents`
metadata and into `.afol/config.json`, while preserving project-local provider
skills under the configured skills directory.

## Problem

`.agents/config.json` still acts as root-detection and path-resolution input.
That makes AFOL runtime behavior depend on a provider metadata surface and
confuses downstream bootstrap ownership: `.agents/**` should stay thin and
provider-facing, while `.afol/**` owns AFOL administration and mutable state.

## Required Behavior

- `.afol/config.json` is the canonical AFOL config file for new installs.
- Existing `.agents/config.json` may be read as a temporary compatibility
  fallback, but diagnostics must identify it as fallback input.
- Root detection, validation, rules, hooks, adapters, bootstrap, update flows,
  and template policy must read config through one shared resolver.
- Project-local skills remain under the configured `paths.skills_dir`; this
  spec does not move `.agents/skills/**` and does not create `.afol/skills/**`.
- `.agents/lock.json` and `.agents/manifest.json` remain separate provider
  metadata decisions unless a later spec explicitly changes them.

## User Journey

1. Maintainer runs `afol status` in an existing project.
2. AFOL reports whether canonical config came from `.afol/config.json` or the
   temporary `.agents/config.json` fallback.
3. Maintainer runs `afol update preview`.
4. Preview shows the config migration without touching provider-local skills.
5. Maintainer runs `afol bootstrap <target> --dry-run`.
6. The generated downstream payload contains `.afol/config.json`, keeps
   `.agents/skills/**`, and does not install a project-local `afol` binary.

## Out Of Scope

- Moving provider skills out of `.agents/skills/**`.
- Replacing `.agents/lock.json` or `.agents/manifest.json`.
- Reintroducing retired `.agents` runtime wrappers, scripts, workbench state,
  or legacy command routing.
- Publishing or deploying a release.

## Acceptance

- `src/project-template` exports `.afol/config.json` for new installs.
- Config diagnostics name the canonical config path and fallback path when
  fallback is used.
- All AFOL config reads go through one resolver.
- Template validation proves `.agents/skills/**` remains valid and
  `.afol/skills/**` is absent.
- `afol validate project --json`, the relevant benchmark pack, typecheck, and
  template validation pass before implementation closure.
