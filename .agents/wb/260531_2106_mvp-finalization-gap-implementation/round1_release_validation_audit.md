# round1_release_validation_audit

## STATUS
**Não pronto para claim de release/public readiness** (F-11/F-12 e plano ULTIMATE Bun/TS) sem ajustes. Os gates existentes cobrem parte da trilha de validação (typecheck, test, build, smoke local e validações estruturais), mas não fecham validação de release completo exigindo evidência persistida, risco de segurança com falha endurecida e garantias públicas de distribuição.

## CURRENT_GATES
- `package.json` já possui fluxos relevantes: `validate:toolchain`, `validate:template`, `validate:bootstrap`, `build:deterministic`, `smoke:dist`, `validate:security`, e `validate:release` em cadeia.
- `validate:release` atual: `bun run validate:toolchain && bun run validate:template && bun run validate:bootstrap && bun run build:deterministic && bun run smoke:dist && bun run validate:security`.
- `smoke:dist` já força compilação e executa `./dist/afol --help`, o que é bom para checar binário compilado.
- CI existente (`.github/workflows/agents-scaffold-ci.yml`) roda: install + typecheck + test + build + `./dist/afol --help` + `smoke:clean`.
- `package.json` tem `security:scan:informative` e `validate:security` depende dela; o scan é opcional (`informative`) e não bloqueia release por padrão.
- Existe trilha de benchmark no repositório com `registry.json`, `scenarios/`, `baselines/` e resultados armazenados em `.agents/data/benchmarks/results/`, porém os dados atuais não mostram execução completa do alvo público recente de F-11/F-12 (incluindo evidências esperadas por plataforma/pack).
- `bun.lock` existe e é referenciado por `build:deterministic` com `bun install --frozen-lockfile`.

## RELEASE_GAPS
1. **Escopo insuficiente no CI atual versus `validate:release`**
   - Workflow de PR/main não executa `validate:release` completo, nem a etapa de distribuição/release em cadeia.
   - Falta trilha explícita de release no pipeline com evidência persistida como artefato (ex.: logs/resultado JSON com status final).

2. **Segurança não é gate obrigatório**
   - O fluxo de segurança é informativo e não bloqueia falhas de `osv`/`gitleaks` quando instalados.
   - Para claim de readiness público, o esperado é falha explícita em nível de política (`validate:security` hard fail) ou política documentada com aceitação de risco aprovada.

3. **`dist/afol` + `bin` mapping inconsistente com claims de release/publicação**
   - `bin.afol` aponta para `./afol`, enquanto script de build gera `dist/afol` e validação/CI também usa `./dist/afol`.
   - Há risco de inconsistência de instalação/consumo em cenários globais, principalmente para claim de distribuição de binário publicável.

4. **Compatibilidade cross-platform incompleta para claims de release público**
   - Não há evidência de validação multi-plataforma consolidada no CI atual (Linux-only predominante).
   - Scripts de smoke/clean (ex.: uso de `bash -lc`, `mktemp`) tornam o pacote menos neutro para claims cross-OS sem validações equivalentes em macOS/Windows.

5. **Lacunas de evidência conforme F-11/F-12**
   - F-11/F-12 exigem rastreabilidade de cenários, packs, entradas, outputs, duração, tokens/bytes (quando aplicável), decisões de falha e resultado persistido.
   - Há estrutura de benchmark existente, mas o relatório atual mostra cenários pendentes (`not-implemented-live-runner`, `skipped`) e não cobre fechamento completo do checklist de evidência pública.

6. **Claims de distribuição pública ainda parciais**
   - F-12 (selo de distribuição pública e onboarding) tipicamente exige artefatos observáveis por release (checksums, notas de reprodução, instruções de instalação por plataforma, release notes de compatibilidade).
   - Não há evidência de geração/verificação desses artefatos no fluxo padrão de `validate:release`.

## MUST_ADD_TO_PLAN
1. Inserir um job dedicado de `validate:release` no CI (incluindo `validate:security` com política explícita de falha ou aprovação formal de risco).
2. Definir política de segurança hard-fail para scan (ou risco documentado em doc técnica com owners/rollback) e alinhar nomenclatura dos níveis de severidade.
3. Normalizar distribuição de binário: validar e documentar se o `bin` da lib deve apontar para `dist/afol` e garantir consistência com wrapper/instalação.
4. Adicionar matrix de validação cross-platform para smoke+build+release (Linux/macOS/Windows) e garantir comandos compatíveis.
5. Expandir e acoplar evidência de benchmark/public release ao pipeline:
   - persistir JSON por run
   - registrar pack/escopo/resultado
   - capturar métricas exigidas
   - anexar artefatos ao CI.
6. Acrescentar steps de release packaging:
   - geração de checksums/hash de artefatos
   - trilha de assinatura/notarização conforme plataforma
   - smoke de instalação consumível do pacote publicado.
7. Revisar e fechar itens F-12 de onboarding público (docs de instalação, distribuição inicial, requisitos mínimos, troubleshooting inicial) com evidência versionada.

## COMMANDS_RUN
- `rg --files`
- `rg --files src/project-template`
- `cat package.json`
- `cat .github/workflows/agents-scaffold-ci.yml`
- `cat bun.lock` (verificação de presença/estrutura)
- `cat docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
- `cat docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md`
- `cat docs/arc/260521_total-reformulation-execution-plan.md`
- `cat docs/arc/GENERAL-ROADMAP.md`
- `cat docs/arc/SPECS/INDEX.md`
- `cat docs/arc/SPECS/FOLDER_GUIDE.md`
- `cat docs/arc/SPECS/F-11/spec-tests/260521_0145_validation-ci-benchmark-matrix_spec-test_01.md`
- `cat docs/standards/scripts-reference.md`
- `cat cli/dev/security-scan.ts`
- `cat cli/dev/toolchain-smoke.ts`
- `cat src/project-template/afol`
- `cat src/project-template/a`
- `cat src/project-template/Justfile`
- `cat src/project-template/AGENTS.md`
- `cat .agents/data/benchmarks/README.md`
- `cat .agents/data/benchmarks/registry.json`
- `cat .agents/data/benchmarks/results/20260529_142632_cli-kernel-local.json`
- `cat .agents/data/benchmarks/results/20260529_142633_runtime-live-agent.json`
- `ls -la .agents/data/benchmarks/results`
