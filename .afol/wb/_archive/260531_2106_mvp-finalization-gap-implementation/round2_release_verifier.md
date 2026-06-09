---
doc_type: standard
id: round2-release-verifier
theme: 260531_2106_mvp-finalization-gap-implementation
status: active
created_at: '2026-05-31T23:46:29-03:00'
updated_at: '2026-05-31T23:46:29-03:00'
---

## STATUS
- `validate:release` atual é forte para higiene técnica (`typecheck`, template/bootstrap validation, `build:deterministic`, `smoke:dist`), mas **não fecha release público por si só**.
- `cli/dev/security-scan.ts` confirma que o caminho de segurança é **informativo** (continua com falha quando ferramenta indisponível e só para se a ferramenta encontra erro), então não atende “hard-fail” de política.
- `agents-scaffold-ci.yml` valida tipo/test/build/`./dist/afol --help`/smoke limpo, porém **não executa `validate:release` completo** e **não persiste artefatos de evidência** de release.
- Conclusão: para **MVP interno mínimo** as lacunas já estão contornáveis com ajustes pequenos; para **release público amplo** faltam evidências formais e governança de segurança/distribuição.

## RELEASE_MINIMUM
- Incluir `bun run validate:release` como job/passo obrigatório no CI, com artefato de resultado de execução (status, logs resumidos, duração).
- Converter segurança de `validate:security` para comportamento de release-policy:
  - manter `security:scan:informative` para ambiente local/compatibilidade,
  - porém em CI/branch-release usar job que falha explicitamente em achados de severidade definida.
- Manter trilha existente de build determinístico + clean checkout (`bun install --frozen-lockfile`, `bun run build:deterministic`, `bun run smoke:dist`, `bun run smoke:clean`) como pré-requisito de release.
- Garantir consistência de evidência de release para o caminho mínimo:
  - resultado persistido por rodada (`validate`/`bench`/`security`),
  - hash/checksum do artifact compilado para rastreio simples.
- Ativar cobertura mínima de cenários de F-11 já requeridos pelo plano (pack/schema/resultado) no fluxo de CI para evitar aprovação sem evidência.

## PUBLIC_RELEASE_GAPS
- Falta prova estruturada de distribuição pública: checksums/version metadata, instruções verificáveis de instalação/primeiro-run e trilha de smoke cross-platform.
- CI ainda é mono-plataforma (apenas ubuntu-latest), contradizendo requisito F-12 de claim por alvo nativo com evidência.
- Scan de segurança não é obrigatório; risco de regressão sem bloqueio não é aceitável para release público.
- `runtime-live-agent` aparece como ponto de risco no round1; sem execução ou waiver explícito/refresh, não fecha F-11/F-12 para ambiente público.
- Falta persistência e padronização dos resultados de benchmark conforme schema de tokens/bytes/semântica exigido no spec.

## PLAN_INSERTS
- CI: substituir o job atual por uma matriz leve:
  - `validate` (tipo/test/build/smoke/local),
  - `validate-release` (chamada direta do script composto),
  - `bench-release` (execução dos packs aplicáveis + upload de JSON em artefatos).
- Segurança: adicionar `security` gate com política explícita:
  - “hard-fail” em CI release,
  - catálogo de severidades aceitas, owners e prazo de remediação.
- Public packaging: adicionar etapa de pacote/publicação de prova com checklist mínimo: binário/assinatura (quando aplicável), checksums e smoke de consumo do artefato gerado.
- Benchmarks: persistir `run_id` por execução com metadados exigidos (pack/scenario/host/runtime/model/token fields) e anexar como artefato.
- Documentar no plano/ sessão a decisão de `runtime-live-agent`: executed vs waived (com justificativa) antes de qualquer claim de release.

## DEFER_OR_DECIDE
- Deferir para pós-MVP: Homebrew/curl installers, mercados de distribuição, e assinatura/notarização completa fora do que já está previsto no plano.
- Deferir por ora: claims de suporte pleno Windows/macOS até smoke-native ou VM-backed existir por alvo com evidência.
- Decisão obrigatória agora: tratar `validate:security` como bloco obrigatório de release (hard-gate), ou aceitar risco explícito com waiver datada no escopo de release.

## COMMANDS_RUN
- `sed -n '1,260p' .agents/wb/260531_2106_mvp-finalization-gap-implementation/260531_2106_mvp-finalization-gap-implementation_plan_01.md`
- `sed -n '1,260p' .agents/wb/260531_2106_mvp-finalization-gap-implementation/round1_release_validation_audit.md`
- `cat package.json`
- `sed -n '1,260p' .github/workflows/agents-scaffold-ci.yml`
- `sed -n '1,260p' cli/dev/security-scan.ts`
- `sed -n '1,260p' docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
- `sed -n '1,260p' docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md`
- `rg -n "agentic_start_folder_dev_refactor_TS|260531_2106_mvp-finalization-gap-implementation|release" /home/ozy/.codex/memories/MEMORY.md`
