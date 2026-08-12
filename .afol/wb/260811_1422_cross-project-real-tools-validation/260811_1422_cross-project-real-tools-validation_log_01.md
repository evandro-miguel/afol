# Log

## Timeline

- 2026-08-11T19:22:55.587Z - session created 260811_1422_cross-project-real-tools-validation
- 2026-08-11T19:58:56.446Z - I-006 non-blocking downstream hygiene defect: init/adoption did not add the canonical .afol/wb/.locks/ ignore rule, so completion fence files appeared as untracked project changes. Library campaign will add the narrow ignore locally; AFOL follow-up should manage or document this rule for downstream projects.
- 2026-08-11T19:59:52.191Z - I-007 blocking downstream UX gate: scaffold adoption supplied docs/templates/ux-journey.md only after manual copy and omitted docs/standards/user-journey-registry.md, causing afol ux validate to fail. Library campaign is applying the canonical template now; AFOL follow-up should make init/update manage both required UX artifacts consistently.

## Confirmed Findings

- I-001 — blocker (fixed in the library): A legacy downstream
  `.afol/adm/specs/INDEX.md` frontmatter survived `afol init` as
  project-owned content. The incompatible schema made validation fail until
  the library was manually migrated to the current schema.
- I-002 — non-blocking: `afol init --dry-run` rejects `--json`, which limits
  machine-readable automation. The human-readable compact output works.
- Environment limitation (not an AFOL defect): Spark was absent from the
  configured roster during the campaign.

## Additional Confirmed Findings

- I-003 — non-blocking: Registry/help marks `adr` and `changelog` as
  read-only with no actions, but bare calls fail. The usable routes are
  `adr new` for writes and `changelog add` for appends.
- I-004 — non-blocking: `evolve analyze --json` exits 0 with
  `status=blocked` and recommends `health --area state`; that health command
  is green and provides no recovery action.
- I-005 — non-blocking: `ctx bundle --json` did not resolve the active
  campaign session after indexes and hydration, returning `session:none`
  gaps.
- Downstream observations (not AFOL defects): `update preview` reported
  generated-output conflicts and ADM/memory warnings.
- Campaign coverage: 50/50 root families executed.

## Summary

Recorded seven findings from a 50-family downstream campaign, fixed the two blocking scaffold baselines with focused regressions, passed 2002 tests, typecheck, manifest and Biome, and retained non-blocking follow-ups in the issue ledger.
