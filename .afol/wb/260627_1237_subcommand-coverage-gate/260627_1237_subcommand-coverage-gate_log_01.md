# Log

## Timeline

- 2026-06-27T16:37:31.808Z - session created 260627_1237_subcommand-coverage-gate
- 2026-06-27T16:37:44.519Z - Plan: add registry contract for coverage.subcommands and coverage.subcommand_exemptions; update root/template catalog docs; run focused validator test, typecheck, bench validation, project validation. Observed AFOL warning on start: stale session freshness plus overdue reviews for rules, skills, docs, commands, memory, library, organization.
- 2026-06-27T16:47:40.827Z - Validation note: bun run validate:release passed lint, template generation, bootstrap tests, project-benchmark coverage, build, dist smoke, clean smoke, and security scan, then failed release-provenance because the checkout is intentionally dirty from active benchmark/documentation work. This is not recorded as a passed release gate.
