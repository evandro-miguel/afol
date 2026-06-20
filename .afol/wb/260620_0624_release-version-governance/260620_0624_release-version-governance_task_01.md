# Tasks: release-version-governance

## Task List

- [x] T-01 Version/provenance.
- [x] T-02 Update/install guardrails.
- [x] T-03 Docs/runbook.
- [x] T-04 Tests/validation/closure.

## State Board

| Task | State | Owner | Write scope | Validate | Evidence |
|------|-------|-------|-------------|----------|----------|
| T-01 | done | worker | `package.json`, `cli/dev/generate-version.ts`, `cli/dev/release-provenance.ts`, `cli/generated/version.ts` | `bun run version:check`; `bun run release:provenance:release` | `cli/tests/version-metadata.test.ts` + `.afol/wb/260620_0624_release-version-governance/.evidence.jsonl` |
| T-02 | done | worker | `cli/commands/update.ts`, `cli/commands/bootstrap.ts`, `cli/services/state/validate.ts`, `cli/tests/update-command.test.ts` | `bun test cli/tests/update-command.test.ts cli/tests/bootstrap.test.ts` | evidence entry for guardrail paths |
| T-03 | done | docs | `.afol/adm/doctrine/RELEASE-RUNBOOK.md`, `.afol/adm/specs/260521_0090_template-update-and-versioning_spec_01.md`, `docs/standards/bootstrap-other-repo.md` | `afol validate project --json` | evidence entry for docs alignment |
| T-04 | done | tester | `cli/tests/version-metadata.test.ts`, `cli/tests/release-toolchain.test.ts`, `.afol/wb/260620_0624_release-version-governance/.evidence.jsonl`, `260620_0624_release-version-governance_log_01.md` | `bun run typecheck`; `bun run validate:release`; `afol local-state rebuild --json`; `afol validate project --json`; `afol verify-tasks --strict .afol/wb/260620_0624_release-version-governance` | final closure evidence id, then `afol done`/`afol close` |

## State Marker Rules

- `[ ]` pending
- `[/]` in progress
- `[!]` problem
- `[>]` moved; Notes must include destination + reason
- `[%]` implemented_untested
- `[&]` tested_needs_spec_validation
- `[x]` done

## Notes

- Todas as tasks registraram evidencia antes do fechamento.
- O board e a task list foram reconciliados antes do closeout.
