---
doc_type: standard
id: round2-plan-audit
theme: 260531_2106_mvp-finalization-gap-implementation
status: active
created_at: '2026-05-31T23:46:29-03:00'
updated_at: '2026-05-31T23:46:29-03:00'
roadmap_feature: F-12
parent_spec: 260521_0120_public-distribution-and-onboarding_spec_01
---

# STATUS
Parcial. O plano está em direção correta, mas não está builder-ready completo: há tarefas redundantes/abstratas, falta de critérios de fechamento operacional em dois pontos de release e ausência de alguns pré-requisitos explícitos de risco.

# PLAN_QUALITY
- `T-20b-F09`, `T-18-F08`, `T-16-F07` e `T-28-F12` são objetivos e executáveis, com ACE claro.
- `T-10a-F10` e `T-24-F11` se sobrepõem muito (paridade MCP/adapters e validação de erros/waivers), criando risco de dupla execução e inconsistência de evidência.
- `T-27-F11` tem escopo de “matrix + waiver” ainda genérico: falta definir pacote mínimo, comando de execução, saída esperada e artefato persistido exigido pelo spec.
- O plano não traz nenhuma task explícita para reduzir `runLegacyAdapter` em `main.ts`/`router.ts`, apesar de o próprio round1 code audit apontar esse risco técnico como bloqueante para F-10.
- Falta task dedicada para endurecer segurança de release para “hard-fail” em CI, com severidade/politica e sinal de falha explícito.

# MISSING_TASKS
- Adicionar task explícita de `update apply`: aplicar diff de manifesto com rollback parcial/total e confirmação pré-escrita (não só validação guardrails).
- Adicionar task para remover/encapsular rota `runLegacyAdapter` em comandos cobertos por parity (especialmente `runtime`, `knowledge`, `tools`, `mcp`, `lifecycle`, `task`), com cobertura por command-id.
- Adicionar task de `runtime-live-agent`: decisão obrigatória `executed` ou `waived` com artefato de execução de pack no repositório de benchmark.
- Adicionar task de evidência CI/CD para release: executar `validate:release` no workflow, persistir JSON de resultado e logs, registrar pack/scenario/resultados.
- Adicionar task de segurança release: política hard-fail para `validate:security` (ou waiver datado com owner+expiração).
- Adicionar task de distribuição pública: checksums/notarização/repro steps + smoke de instalação/primeiro-run cross-platform conforme claims em F-12.

# DUPLICATE_OR_DEFER
- Deferir para pós-MVP:
  - Windows/macOS smoke em nível completo, Homebrew/curl installers, notarização completa (se não houver infraestrutura de assinatura no ciclo atual).
  - Migração total de superfície legacy Python/compatibilidade fora do escopo F-10 atual.
- Consolidar e deduplicar:
  - `T-10a-F10` + `T-24-F11` em uma única tarefa de parity MCP/adapter com checklist único de envelopes, roteamento, erros e waiver.

# FINAL_TASK_ORDER
1. `T-20b-F09` Atualizar/validar `update apply` com decisão de ownership + persistência de evento/journal.
2. `T-18-F08` Implementar `file archive` + restore/undo determinístico + testes.
3. `T-16-F07` Completar local-state para entidades faltantes conforme critério F-07 e validar stale/freshness.
4. `T-10a-F10` + `T-24-F11` (fundir) em uma só task: parity MCP/adapter core, `runLegacyAdapter` mapeado/retirado, `runtime-support` explicitamente depre/enableado.
5. `T-27-F11` executar benchmark suite com `runtime-live-agent` resolvido por execution ou waiver formal.
6. `T-28-F12` fechar release/public proof: `validate:release` no CI, hard-fail security policy, artifacts (checksums/logs/evidence), smoke first-run.
7. Task de follow-up de distribuição por alvo (quando suporte cross-platform estiver no plano): validação matricial com resultado persistido.

# VALIDATION_EXPECTED
- `bun run typecheck` + `bun test` + `bun run validate:release` em CI por rodada final.
- `./a up ck` e `./a up ap` como checks de runtime legado/compatibilidade conforme plano de de-risking.
- Arquivos de evidência por pack/scenario com schema esperado de F-11 (pack/scenario/resultado/base/host/runtime/metadados).
- Evidence log auditável para `runtime-live-agent` com status `executed` ou waiver datado.
- `./dist/afol --help`, build determinístico e smoke reprodutível aprovados em branch de fechamento público.
