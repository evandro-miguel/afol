---
title: "Changelog"
description: "Version-to-version summary of repository-map changes, focusing on entered/removed elements and major metric shifts."
doc_kind: "changelog"
version: "v2026-05-28_1"
created_at: "2026-05-28T09:48:25Z"
updated_at: "2026-05-29T16:03:04-03:00"
---

# Changelog

## Version Transition

- Current version: `v2026-05-28_1`
- Previous version: `none`
- Updated at: `2026-05-28T09:48:25Z`

## Initial Snapshot

- This is the first structured codemap snapshot with versioned frontmatter and changelog support.
- Domains detected: ``
- Public boundary files detected: `2`
- Top hotspots tracked: `0`

## F-01 Through F-03 Governance Reconciliation

- Feature: `F-01` through `F-03`
- Scope: current-state docs reconciliation for the universal CLI, minimal
  template, and command design slices.
- Accepted implementation evidence:
  - `E-20260528215311949499`
  - `E-20260528220141194181`
  - `E-20260529135617802715`
  - `E-20260529134101240986`
- Strict verification: the representative sessions
  `.afol/wb/260528_0722_slice2-cli-kernel-front-door/`,
  `.afol/wb/260529_1350_f02-template-export-alignment/`, and
  `.afol/wb/260529_1336_f03-kernel-grammar-alias-help/` all passed
  `verify-tasks --strict`.
- Status: satisfied for the docs/current-state layer; residual risk is limited
  to future derived-index drift, not the current refresh.

## F-04 Through F-08 Governance Reconciliation

- Feature: `F-04` through `F-08`
- Scope: current-state docs reconciliation for the governance workbench,
  routing, file-first execution, local-state indexing, and safe mutation
  slices.
- Accepted implementation evidence:
  - `E-20260528084521802724`
  - `E-20260528100236370279`
  - `E-20260528103543755917`
  - `E-20260528112023377690`
  - `E-20260528122615973830`
- Strict verification: the representative sessions
  `.afol/wb/260528_0833_f04-workbench-core-review-fix/`,
  `.afol/wb/260528_0956_f05-review-parity-strict/`,
  `.afol/wb/260528_1029_f06-review-fix/`,
  `.afol/wb/260528_1111_f07-local-state-review-fix/`, and
  `.afol/wb/260528_1145_f08-safe-file-mutation-undo/` all passed
  `verify-tasks --strict`.
- F-08 board cleanup accepted stale task removal in `cb2e024`.
- Status: satisfied for the docs/current-state layer; residual risk is limited
  to future derived-index drift, not the current refresh.

## F-16 Project Template Source Separation Closeout

- Feature: `F-16 Project Template Source Separation`
- Accepted implementation evidence: `b520f23`, `75cf349`
- Index state: `docs/arc/SPECS/INDEX.md` now marks the parent spec as `final`.
- Status: `satisfied` for the docs/governance closeout; residual risk is limited to future docs drift, not the accepted implementation slices.

## F-13 Closure Note

- Feature: `F-13 Agentic Runtime Restructure`
- Anchor commit: `5b50b3a`
- Status: `satisfied` for runtime registry/MCP/catalog parity and `just all`; `partial` for legacy delegate removal because compatibility delegates remain preserved.
- Residual risk: this is not native removal of the legacy scripts, only a conservative closure note on the current state.

## F-13 Tool Catalog Parity Slice

- Scope: runtime registry/tool catalog parity for the accepted F-13 command surface.
- Runtime change: registry metadata and docs now reflect the real runtime gates for `status`, `session catchup`, and `knowledge`.
- Accepted implementation evidence: `c24d386`.
- Status: satisfied for catalog/docs parity; residual risk is limited to descriptive metadata, not runtime behavior.

## F-13 Status Native Port Slice

- Scope: bounded port of the `status` command family only.
- Runtime change: `agentic status` now executes in-process through runtime registry (`phase=native`) instead of spawning a delegated subprocess.
- Parity evidence: focused runtime tests compare JSON/text/error behavior against `.agents/scripts/agents-status.py`.
- Accepted implementation evidence: `3e27bac`.
- Remaining scope: other command families still route through compatibility delegation.

## F-13 Knowledge Pull Native Port Slice

- Scope: bounded native dispatch for `knowledge pull` only; no broad `knowledge` family refactor.
- Runtime change: `agentic knowledge pull` now executes in-process through runtime search/format logic instead of spawning delegated `agents-knowledge.py`.
- Parity evidence: focused runtime tests compare output/exit behavior against `.agents/scripts/agents-knowledge.py`, including missing-topic behavior.
- Accepted implementation evidence: `b22d45f` and `e9a0f44`.
- Remaining scope: non-`pull` knowledge subcommands and other command families still route through compatibility delegation.

## F-13 Session Catchup Native Port Slice

- Scope: bounded native dispatch for `session catchup` only; no broad session lifecycle refactor.
- Runtime change: `agentic session catchup` now executes in-process through runtime session catchup logic instead of spawning delegated `agents-session.py`.
- Parity evidence: focused runtime tests compare JSON/text behavior against `.agents/scripts/agents-session.py`.
- Accepted implementation evidence: `8cd4737`.
- Remaining scope: other session subcommands still route through compatibility delegation.

## F-13 Knowledge List/Search/Show Native Port Slice

- Scope: bounded native dispatch for `knowledge list/search/show` only; `knowledge index` remained delegated at that point.
- Runtime change: `agentic knowledge list/search/show` now executes in-process through runtime knowledge search/format logic instead of spawning delegated `agents-knowledge.py`.
- Parity evidence: focused runtime tests compare output/exit behavior against `.agents/scripts/agents-knowledge.py`.
- Accepted implementation evidence: `bde5500`, `e918255`, and `7c98199`.
- Remaining scope: `knowledge index` and other command families still route through compatibility delegation.

## F-13 Knowledge Index Native Port Slice

- Scope: bounded native dispatch for `knowledge index` only; no broad `knowledge` family refactor.
- Runtime change: `agentic knowledge index` now executes in-process through runtime knowledge index generation instead of spawning delegated `agents-knowledge.py`.
- Parity evidence: focused runtime tests compare output/exit behavior against `.agents/scripts/agents-knowledge.py`.
- Accepted implementation evidence: `8bd9466`.
- Remaining scope: non-targeted knowledge subcommands and other command families still route through compatibility delegation.

## F-17 Catalog Lifecycle Closeout

- Feature: `F-17 Just Command Runner Migration`
- Accepted child slices:
  - `command-parity-gate-hardening` (`0d9f1cd`, `a13ce65`, `85ce32d`)
  - `bootstrap-template-justfile-wiring` (`6bf1453`, `059c927ee4e32accab85e9c38f594e3cb0f94cc3`)
- Index state: `docs/arc/SPECS/INDEX.md` now marks the parent spec and both accepted child specs as `final`.
- Status: `satisfied` for the docs/catalog lifecycle closeout; residual risk is limited to descriptive metadata, not runtime behavior.

## F-09 Template Update And Versioning Closeout

- Feature: `F-09 Template Update and Versioning`
- Accepted implementation evidence:
  - `5a1811fe0a967fc8a89c2c78a2722d972e210700`
  - `6fc611a095cca821c9276aad5b29ecc1fbd3ea96`
- Index state: `docs/arc/SPECS/INDEX.md` now marks the parent spec as `final`.
- Status: `satisfied` for the docs/catalog lifecycle closeout; residual risk is limited to descriptive metadata, not runtime behavior.

## F-11 Validation, CI, and Benchmarks Closeout

- Feature: `F-11 Validation, CI, and Benchmarks`
- Accepted session-backed artifacts:
  - `.afol/wb/260528_1409_f11-validation-benchmark-contract`
  - `.afol/wb/260529_0958_f11-ci-selector-matrix-pack-map`
  - `.afol/wb/260529_1018_f11-real-typecheck-gate`
  - `.afol/wb/260529_1030_f11-routing-accuracy-pack-wave`
  - `.afol/wb/260529_1043_f11-update-safety-pack-wave`
  - `.afol/wb/260529_1054_f11-mutation-safety-pack-wave`
- Accepted implementation evidence:
  - `3a6456e`
  - `afe8a79`
  - `a1fa3e1`
  - `7760358`
  - `681c6d0`
  - `8dd5e20`
- Matrix state: 8 packs with scenarios and baselines now define the current
  benchmark surface under `.agents/data/benchmarks/`.
- Persisted selected-pack results:
  - `.agents/data/benchmarks/results/20260529_142632_cli-kernel-local.json`
  - `.agents/data/benchmarks/results/20260529_142632_workbench-parity.json`
  - `.agents/data/benchmarks/results/20260529_142633_routing-accuracy.json`
  - `.agents/data/benchmarks/results/20260529_142633_mutation-safety.json`
  - `.agents/data/benchmarks/results/20260529_142633_update-safety.json`
  - `.agents/data/benchmarks/results/20260529_142633_mcp-parity.json`
  - `.agents/data/benchmarks/results/20260529_142633_runtime-live-agent.json`
  - `.agents/data/benchmarks/results/20260529_142633_token-economy.json`
- Live evidence: `runtime-live-agent` is now artifact-backed with
  `status=passed` in the persisted result artifact above.
- Global benchmark: `bun run cli/main.ts v bench --json` now reports `36/36`
  with `skipped=0`, and scripts coverage validation stayed above threshold at
  `84.11/84.12`.
- Index state: `docs/arc/SPECS/INDEX.md` now marks
  `260521_0110_validation-ci-and-benchmarks_spec_01` as `final`.
- Status: `satisfied` for the docs/current-state layer; residual risk is
  limited to future derived-index drift, not the current refresh.

## F-15 Repo-Wide Simplification Runtime Parity Closeout

- Feature: `F-15 Repo-Wide Simplification Runtime Parity`
- Accepted child slices:
  - `scripts-cleanup-optimization` (`.afol/wb/260528_1606_scripts-cleanup-optimization/`)
  - `map-boundary-cleanup` (`.afol/wb/260528_1723_map-boundary-cleanup/`)
  - `runtime-registry-parity` (`.afol/wb/260528_1745_runtime-registry-parity/`)
  - `python-command-simplification` (`6851c27`)
- Index state: `docs/arc/SPECS/INDEX.md` now marks the parent spec and accepted child specs as `final`.
- Status: `satisfied` for the current-state docs/map layer; residual risk is limited to future follow-up planning, not the closed F-15 slices.

## F-14 Governance State Reconciliation

- Scope: current-state docs reconciliation for the F-14 governance slice.
- Status: roadmap entry and parent spec are `final`; verified report is
  `.afol/wb/260528_1528_spec-child-and-spec-test-governance/260528_1528_spec-child-and-spec-test-governance_report_01.md`.
- Evidence: `E-20260528153442093351`.

## F-12 Public Distribution And Onboarding Closeout

- Scope: current-state docs reconciliation for the F-12 onboarding slice.
- Status: roadmap entry and parent spec are `final`.
- Evidence: `E-20260528144544308053`.

## F-10 Runtime Adapters And MCP Closeout

- Scope: current-state docs reconciliation for the F-10 runtime adapter slice.
- Status: roadmap entry and parent spec are `final`.
- Evidence: `E-20260528134556147936`.
