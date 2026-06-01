STATUS
- Round 2 de verificação concluído. Foram validados os gaps do Round 1 contra o código atual e testes, sem alterar plano/código.

CONFIRMED_GAPS
- P0 | `cli/commands/update.ts` não possui subcomando `apply`; `runUpdateCommand()` dispara somente fluxo de preview/check read-only (`check`, `preview/plan`).
  - Impacto: comando de finalização de templates do MVP não consegue aplicar mudanças no filesystem.
  - Evidência: apenas `normalizeSubcommand()` permite `check|ck|preview|plan`; não há chamada de write path.
- P1 | `file archive` continua não implementado apesar de exposto no comando.
  - Impacto: operação de arquivo não disponível no MVP apesar de estar documentada como comando.
  - Evidência: `cli/commands/file.ts` `runArchiveMutation()` retorna `dry-run`/`blocked` com mensagem de MVP não implementado.
- P1 | Cobertura de estado local ainda centrada em workbench e não reflete totalmente F-07.
  - Impacto: index/event log não cobre o escopo completo (por exemplo regras/skills/specs/files além de sessões/índices de workbench).
  - Evidência: serviços locais em `cli/services/local-state` estão orientados a `workbench*` (ver `workbench-events.ts`, `workbench-index.ts`) e não há módulos paralelos para outros domínios no fluxo de persistência revisado.
- P2 | Paridade de adapters/runtime (F-10) permanece por delegação legacy.
  - Impacto: caminhos de runtime/knowledge/memory/mcp/etc. ainda vão por wrapper legado e não execução nativa Bun/TS.
  - Evidência: `cli/main.ts` encaminha comandos não nativos para `runLegacyAdapter`/`spawn` via `.agents/agents`; `registry.ts` mantém vários tokens em `delegate`.
- P2 | Validação runtime-live de benchmark ainda com waiver explícito.
  - Impacto: F-11 não está “green” como execução real; risco de regressão não coberto por benchmark.
  - Evidência: resultado `.../cli/data/benchmarks/results/20260529_142633_runtime-live-agent.json` com `status: skipped` e `not-implemented-live-runner`.

FALSE_POSITIVES_OR_DOC_ONLY
- Nenhum dos gaps principais de Round 1 testados aqui foi falso positivo.
- O que estava “pendente” em docs sobre runtime-live está documentado com waiver explícito em artifacto; isso não vira bug novo, é dívida de fechamento que precisa decisão de liberação.

PRIORITY
- P0: Implementar `update apply` com fluxo seguro (validação + write)
- P1: Implementar `file archive` (ou remover/clarificar da UX atual se não for parte do MVP)
- P1: Expandir local-state/index para entidades adicionais conforme F-07
- P2: Fechar lacunas de F-10 com decisão arquitetural: continuar delegação com nota explícita de não-finalizado ou expandir native adapters
- P2: Remover waiver de runtime-live (F-11) com execução real de cenário
- P2: Fechar requisitos de F-12 de smoke/build cross-platform

PLAN_INSERTS
- Incluir item no plano principal: "F-10/F-11: adicionar suíte de execução nativa para runtime/mcp e atualizar `registry`/`router` para refletir parity progressivamente".
- Incluir item no plano principal: "F-07: criar cobertura local-state para regras/especificações/sessão/artefatos (segundo spec), com testes de index/event.".
- Incluir item no plano principal: "F-08/F-09 (template/versioning e mutation safety): completar fluxo `update apply` e validar escrita com testes.
- Incluir item no plano principal: "cmd:file: implementar `archive` (ou explicitamente de-sobrescrever do contrato de CLI/MVP) com testes de bloqueio/sucesso.
- Incluir item no plano principal: "F-11/F-12: remover skips de benchmark (runtime-live) e publicar evidência de build/smoke + distribuição pública."

DEFER_OR_DECIDE
- Defer (decidindo): paridade completa de todos os adapters MCP/stack legacy (`runtime/memory/tools/knowledge/mcp` etc.) para a próxima iteração, desde que o MVP mantenha delegação estável e isso esteja explicitado no plano de escopo.
- Defer (decidindo): prometer cobertura completa de release/publicação cross-platform antes de validação de benchmark green final, caso não exista matriz/artefato dedicado nesta rodada.
- Decidir no próximo ciclo: manter `file archive` como comando stub de aviso (documentado como não suportado) ou priorizar implementação completa; hoje está em estado bloqueado e deve ser resolvido por decisão de escopo.

COMMANDS_RUN
- `rg --files | rg '260531_2106_mvp-finalization-gap-implementation_plan_01.md|round1_docs_audit.md|round1_code_audit.md'`
- `sed -n '1,260p' .agents/wb/260531_2106_mvp-finalization-gap-implementation/260531_2106_mvp-finalization-gap-implementation_plan_01.md`
- `sed -n '1,260p' .agents/wb/260531_2106_mvp-finalization-gap-implementation/round1_docs_audit.md`
- `sed -n '1,260p' .agents/wb/260531_2106_mvp-finalization-gap-implementation/round1_code_audit.md`
- `sed -n '1,260p' docs/arc/GENERAL-ROADMAP.md`
- `sed -n '1,320p' docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md`
- `sed -n '1,320p' docs/arc/SPECS/260521_0080_safe-file-mutation-and-undo_spec_01.md`
- `sed -n '1,320p' docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md`
- `sed -n '1,340p' docs/arc/SPECS/260521_0100_runtime-adapters-and-mcp_spec_01.md`
- `sed -n '1,320p' docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
- `sed -n '1,320p' docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md`
- `sed -n '1,320p' cli/commands/update.ts`
- `sed -n '1,300p' cli/services/local-state/workbench-events.ts`
- `sed -n '1,360p' cli/services/local-state/workbench-index.ts`
- `sed -n '1,340p' cli/commands/file.ts`
- `sed -n '1,260p' cli/main.ts`
- `sed -n '1,280p' cli/registry.ts`
- `sed -n '1,260p' cli/commands/validate.ts`
- `cat cli/services/local-state/workbench-events.ts`
- `cat cli/services/local-state/workbench-index.ts`
- `cat cli/tests/validation.test.ts`
