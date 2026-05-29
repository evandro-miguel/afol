---
title: "Changelog"
description: "Version-to-version summary of repository-map changes, focusing on entered/removed elements and major metric shifts."
doc_kind: "changelog"
version: "v2026-05-28_1"
created_at: "2026-05-28T09:48:25Z"
updated_at: "2026-05-28T23:10:13Z"
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
