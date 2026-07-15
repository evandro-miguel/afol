# Report: 260713_0753_documentation-and-template-freshness

## Summary
Public CLI docs, governance, release contracts, and exportable template now match the live AFOL implementation; full tests and clean validate:release passed.

## Tasks
- T-01: done — Align public CLI documentation and help with live contracts attempt=1
- T-02: done — Refresh governance specs standards templates and release runbook attempt=1
- T-03: done — Fix exportable template policy and remove retired or nonexistent skill flows attempt=1
- T-04: done — Validate documentation template manifests and final review attempt=1

## Evidence
- T-01: passed (bun test --only-failures cli/tests/kernel.test.ts; exit_code=0)
- T-02: passed (sh -c 'afol local-state rebuild --json >/dev/null && afol validate project --json >/dev/null'; exit_code=0)
- T-03: passed (sh -c 'bun run template:check >/dev/null && bun run manifest:check >/dev/null && bun test --only-failures cli/tests/validate-command.test.ts >/dev/null'; exit_code=0)
- T-04: failed (sh -c 'bun run validate:release > .afol/wb/260713_0753_documentation-and-template-freshness/validate-release.log 2>&1'; exit_code=1)
- T-04: passed (sh -c 'cd /home/ozy/01_projects/dev/afol/afol.dev/.tmp/release-docs && bun run validate:release > /home/ozy/01_projects/dev/afol/afol.dev/.afol/wb/260713_0753_documentation-and-template-freshness/validate-release-clean.log 2>&1'; exit_code=0)
- T-04: passed (sh -c 'bun test --only-failures cli/tests/kernel.test.ts cli/tests/template-policy.test.ts >/dev/null && afol local-state rebuild --json >/dev/null && afol validate project --json >/dev/null'; exit_code=0)
