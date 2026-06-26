# Plan: release-version-governance

- Created by native CLI workbench lifecycle.

## Native command metadata
- task: Criar fluxo maduro de atualizacao/versionamento registrado do AFOL, executar validacao e fechar sem tasks/issues abertas
- checkpoint: commit `fdd933b` ja bumpou `package.json`/CLI de `0.1.0-alpha.0` para `0.1.0-alpha.1`
- repo facts:
  - `package.json` expõe `version:generate`, `version:check`, `release:provenance`, `release:provenance:release`, `validate:toolchain`, `validate:release`, `smoke:clean`
  - `cli/generated/version.ts` já é coberto por `cli/tests/version-metadata.test.ts`
  - `cli/commands/update.ts` e `cli/commands/bootstrap.ts` são os alvos naturais para guardrails de update/install
  - `cli/tests/update-command.test.ts`, `cli/tests/release-toolchain.test.ts` e `cli/tests/bootstrap.test.ts` já existem para fechar o circuito
  - `.afol/adm/doctrine/RELEASE-RUNBOOK.md` já define `afol local-state rebuild --json`, `afol validate project --json`, `bun run typecheck` e `bun run validate:release` como preflight de release

## Objective

- Impedir que versões AFOL antigas ou nao registradas cheguem a update/install/release.
- Manter version/provenance reproduciveis e rastreaveis ao `package.json`.
- Atualizar docs e runbook para o fluxo real.
- Fechar a sessao com evidencias e sem tasks/issues abertas.

## Scope

- In scope: version/provenance, update/install guardrails, docs/runbook, testes/validacao/closure.
- Out of scope: mudanca de comportamento nao relacionada, runtime legado `.agents`, limpeza ampla fora do objetivo.

## Execution Contract

- Cada slice deve ter write scope proprio e nao sobrepor o slice anterior.
- Cada slice precisa terminar com comando verificavel e evidencia esperada.
- Nao marcar task como done sem `.evidence.jsonl` correspondente e sem gate final de AFOL.

## Delivery Strategy

1. T-01 Version/provenance.
   - Write scope: `package.json`, `cli/dev/generate-version.ts`, `cli/dev/release-provenance.ts`, `cli/generated/version.ts`.
   - Outcome: a versao registrada e os artefatos de provenance saem da mesma fonte de verdade e nao dependem de valor velho ou placeholder.
   - Acceptance: `bun run version:check` passa; `bun run release:provenance:release` gera provenance consistente com a versao ativa e o commit atual.
2. T-02 Update/install guardrails.
   - Write scope: `cli/commands/update.ts`, `cli/commands/bootstrap.ts`, `cli/services/state/validate.ts`, `cli/tests/update-command.test.ts`.
   - Outcome: update/install rejeitam estado antigo ou nao registrado antes de mutar o repo.
   - Acceptance: testes de update/bootstrap cobrem caminho aceitar/rejeitar e mensagens de erro de guardrail.
3. T-03 Docs/runbook.
   - Write scope: `.afol/adm/doctrine/RELEASE-RUNBOOK.md`, `.afol/adm/specs/260521_0090_template-update-and-versioning_spec_01.md`, `docs/standards/bootstrap-other-repo.md`.
   - Outcome: operador encontra o fluxo AFOL-only, os preflights obrigatorios e o sequenciamento de release/fechamento.
   - Acceptance: docs citam os mesmos comandos usados na validacao e descrevem o closeout sem ambiguidade.
4. T-04 Tests/validation/closure.
   - Write scope: `cli/tests/version-metadata.test.ts`, `cli/tests/release-toolchain.test.ts`, `.afol/wb/260620_0624_release-version-governance/.evidence.jsonl`, `260620_0624_release-version-governance_log_01.md`, `260620_0624_release-version-governance_task_01.md`.
   - Outcome: evidencia, board e log ficam coerentes e a sessao pode fechar sem pendencias.
   - Acceptance: gates finais passam antes de qualquer task virar done.

## Critical Dependencies

- Tools: `afol`, `bun`.
- Skills: `agentic-folder-sys`.
- Executor instruction: se o gate revelar drift ou conflito de board, registrar o fato concreto e atualizar riscos/validacao antes de fechar.

## Risks and Mitigations

- Risk: `package.json` e `cli/generated/version.ts` divergirem. -> Mitigation: manter `version:check` e `version-metadata.test.ts` como gate inicial do slice T-01.
- Risk: guardrails de update/install bloquearem fluxo valido. -> Mitigation: preservar os casos cobertos por `cli/tests/update-command.test.ts` e adicionar rejeicao explicita, nao heuristica silenciosa.
- Risk: docs ficarem desalinhadas do comportamento real. -> Mitigation: escrever docs na mesma sequencia do fluxo executado e validar os comandos mencionados.
- Risk: tasks aparentarem abertas por estado antigo. -> Mitigation: rodar `afol local-state rebuild --json` antes do `afol validate project --json` e do `afol verify-tasks --strict`.

## Verification Plan

- Unit: `bun test cli/tests/version-metadata.test.ts cli/tests/update-command.test.ts cli/tests/release-toolchain.test.ts`.
- Build/metadata: `bun run version:check`, `bun run release:provenance:release`.
- Release gates: `bun run typecheck`, `bun run validate:toolchain`, `bun run validate:release`.
- AFOL gates: `afol local-state rebuild --json`, `afol validate project --json`, `afol verify-tasks --strict .afol/wb/260620_0624_release-version-governance`.
- Closure evidence: `afol evidence`, `afol done`, `afol close`.

## Closure Criteria

- Todas as tasks ficam com evidence registrada antes de `done`.
- `afol verify-tasks --strict` encontra zero tarefas abertas na sessao.
- O log final aponta os arquivos alterados e o resultado dos gates.
