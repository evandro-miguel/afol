STATUS
PARCIAL

IMPLEMENTED
- F-07 (local-state index/event log): Eventos de workbench em `cli/services/local-state/workbench-events.ts` (`new`, `start_task`, `record_evidence`, `append_log`, `close`), índice persistido em `cli/services/local-state/workbench-index.ts` e testes de ciclo de vida em `cli/tests/workbench-lifecycle.test.ts`.
- F-08 (safe file mutation and undo): Implementações de `pt` (patch), `mv` (move), `ud` (undo) em `cli/commands/file.ts` com sessão/tarefa/motivo, proteção de path, snapshots de segurança e journal (`cli/services/mutations/journal.ts`).
- F-11 (validation/benchmarks): Infra de validação presente em `cli/validate/contract.ts`, cobertura em `package.json` (`validate:toolchain`, `validate:template`, `validate:bootstrap`, `validate:release`, `validate:security`) e testes em `cli/tests/validation.test.ts`.
- F-12 (public release + template boundary): Payload do template em `src/project-template`, proteção via policy e limpeza bootstrap de superfícies legadas em `cli/services/bootstrap/cleanup.ts`.

PARTIAL_OR_MISSING
- F-07: Não há evidência de cobertura local-state equivalente para regras/skills/specs/files fora da trilha principal do workbench.
- F-08: `archive` (`ar`) não está operacional; retorno indica "archive not implemented in this MVP". Sem path de arquivo de restore dedicado a archive.
- F-09: O fluxo de atualização não possui `apply` funcional em `cli/commands/update.ts`; `runUpdateCommand` em `cli/services/update/check.ts` só cobre `check`/`preview` (alias `plan`) e retorna diff para inspeção, sem etapa de materialização/aplicação.
- F-10: Persistem caminhos delegados no legado via `runLegacyAdapter` (registry) para runtime/MCP/adapters principais; não está consolidado em execução nativa TS-first para parity completa.
- F-10: Comando `lifecycle` aparece como rota delegada no `registry`, não como handler nativo completo no comando principal.
- F-12: Falta validação adicional de onboarding público/release scripts focada em jornada do usuário final, além dos checks de boundary/limpeza já presentes.

TEST_COVERAGE
- Leitura de suíte existente: `cli/tests/file-command.test.ts` (sem cobertura para archive real), `cli/tests/update-command.test.ts` (sem apply), `cli/tests/mutation-safety.test.ts`, `cli/tests/bootstrap-cleanup.test.ts`, `cli/tests/bootstrap-template-cleanliness.test.ts`, `cli/tests/workbench-lifecycle.test.ts`, `cli/tests/validation.test.ts`, `cli/tests/downstream-smoke.test.ts`, `cli/tests/template-policy.test.ts`.
- Cobertura funcional por spec:
  - F-07: cobertura parcial boa para lifecycle/index do workbench.
  - F-08: cobertura boa para patch/move/undo, incompleta para archive.
  - F-09: cobertura parcial (check/preview apenas).
  - F-10: cobertura parcial, com risco concentrado nos bridges legado.
  - F-11/F-12: cobertura estrutural com lacunas em testes de experiência de release/public distribution completa.

MUST_ADD_TO_PLAN
- Implementar `update apply` end-to-end (manifest diff apply, confirmação, rollback parcial/total).
- Implementar `file archive` e garantir semântica de restore/integração com undo.
- Expandir local-state para outras entidades caso spec exija (`rules`, `skills`, `specs`, `files`) ou documentar escopo explícito se for workbench-only.
- Migrar/adotar handlers TS-native para lifecycle/runtime/adapters em vez de delegação legado, especialmente `runtime`, `mcp`, `knowledge`, `memory`, `tool`, `task` e `lifecycle`.
- Adicionar validações/benchmarks de ponta a ponta para release/public onboarding (smoke + distribuição de template + scripts esperados pelo usuário final).

COMMANDS_RUN
- rg --files | rg 'docs/arc|package.json|cli/|src/project-template|F-07|F-08|F-09|F-10|F-11|F-12|spec'
- cat package.json
- cat cli/registry.ts
- cat cli/main.ts
- cat cli/router.ts
- rg -n "pt|mv|ud|ar|archive|undo|patch|move|mutat" cli/commands/file.ts
- sed -n '1,260p' cli/commands/file.ts
- sed -n '1,320p' cli/commands/update.ts
- sed -n '1,260p' cli/services/update/check.ts
- sed -n '1,340p' cli/commands/bootstrap.ts
- sed -n '1,300p' cli/commands/workbench.ts
- sed -n '1,340p' cli/commands/file.ts
- sed -n '1,300p' cli/services/bootstrap/planner.ts
- sed -n '1,280p' cli/services/bootstrap/cleanup.ts
- sed -n '1,320p' cli/services/local-state/workbench-events.ts
- sed -n '1,320p' cli/services/local-state/workbench-index.ts
- sed -n '1,280p' cli/services/workbench/lifecycle.ts
- sed -n '1,280p' cli/services/mutations/journal.ts
- sed -n '1,320p' cli/services/template/payload.ts
- sed -n '1,260p' cli/schemas/template-policy.ts
- sed -n '1,300p' cli/validate/contract.ts
- cat cli/tests/update-command.test.ts
- cat cli/tests/mutation-safety.test.ts
- cat cli/tests/bootstrap-conflicts.test.ts
- cat cli/tests/bootstrap-template-cleanliness.test.ts
- cat cli/tests/downstream-smoke.test.ts
- cat cli/tests/template-policy.test.ts
- cat cli/tests/validation.test.ts
- cat cli/tests/workbench-lifecycle.test.ts
- cat cli/tests/bootstrap-cleanup.test.ts
- cat docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md
- cat docs/arc/SPECS/260521_0080_safe-file-mutation-and-undo_spec_01.md
- cat docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md
- cat docs/arc/SPECS/260521_0100_runtime-adapters-and-mcp_spec_01.md
- cat docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md
- cat docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md
- cat docs/arc/SPECS/F-10/spec-tests/260521_0140_runtime-adapters-and-mcp-parity_spec-test_01.md
- cat docs/arc/SPECS/F-11/spec-tests/260521_0145_validation-ci-benchmark-matrix_spec-test_01.md
- cat docs/arc/GENERAL-ROADMAP.md
- cat docs/arc/SPECS/INDEX.md
- rg --files src/project-template
