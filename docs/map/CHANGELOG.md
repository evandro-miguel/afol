---
title: "Changelog"
description: "Version-to-version summary of repository-map changes, focusing on entered/removed elements and major metric shifts."
doc_kind: "changelog"
version: "v2026-05-28_1"
created_at: "2026-05-28T09:48:25Z"
updated_at: "2026-05-29T12:41:20Z"
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
