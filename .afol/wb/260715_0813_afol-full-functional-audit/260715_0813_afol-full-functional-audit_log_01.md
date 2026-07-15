# Log

## Timeline

- 2026-07-15T12:13:10.308Z - session created 260715_0813_afol-full-functional-audit
- 2026-07-15T12:13:49.682Z - Baseline dirty worktree preserved. Audit sequence: installed/repo provenance and registry, isolated downstream bootstrap, core lifecycle/mechanism probes, full validation/security/benchmark gates, then reinstall only from a validated current build if provenance is stale.
- 2026-07-15T12:46:51.684Z - Audit outcome: global clean dev binary reinstalled and provenance-aligned; bootstrap apply/downstream validation passed; help fixed for all canonical commands and aliases; governance wrapper now directly tested; 1163 CLI tests, typecheck, dist smoke, clean release/security and 14/15 packs passed. Residuals: dirty WIP regresses wb-short-done/close p50 beyond 100ms while clean dev passes; mcp-parity remains CLI-only and does not prove an MCP runtime; memory file has 0 entries and honest stale-age warning.

## Summary

Strict verification passed for 4 tasks.
