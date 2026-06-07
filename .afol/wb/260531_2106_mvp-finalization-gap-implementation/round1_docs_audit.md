---
doc_type: standard
id: round1-docs-audit
theme: 260531_2106_mvp-finalization-gap-implementation
status: active
created_at: '2026-05-31T23:46:29-03:00'
updated_at: '2026-05-31T23:46:29-03:00'
---

# STATUS

- Status global da rodada: **partial**.
- Escopo lido: `docs/arc/GENERAL-ROADMAP.md`, `docs/arc/260521_total-reformulation-execution-plan.md` e specs `260521_0070*` a `260521_0120*`.
- Principais achados: os seis pares F-07..F-12 estão documentados como `final`, porém F-11 tem exceção explícita de waiver e há follow-ups sem rastreio explícito de implementação no mesmo ciclo de fechamento.

# MATRIX

| Especificação | Claim de roadmap / spec | Acceptance / Exit criterion (documentada) | Evidência em docs | Status |
| --- | --- | --- | --- | --- |
| F-07 / `260521_0070_local-state-index-and-event-log_spec_01` | Roadmap F-07 (status final): índices locais para workbench/regras/habilidades/especificações/arquivos, event log de comando e arquivo, consultas compactas; follow-up opcional de watcher. | Spec 0070 Acceptance: agentes consultam estado compacto, comandos registram eventos, índices reconstruíveis, estado obsoleto detectável, dados locais. | Roadmap: `Status: final`, exit criteria; closure `E-20260528112023377690` e sessão `.agents/wb/260528_1111_f07-local-state-review-fix/`; spec closure idem. | implemented |
| F-08 / `260521_0080_safe-file-mutation-and-undo_spec_01` | Roadmap F-08 (status final): journal de mutation, contexto sessão/tarefa, dry-run, undo onde viável, paths perigosos protegidos. | Spec 0080 Acceptance: mutation registrada, dry-run com prévia de patch, undo funcional onde suportado, protected paths bloqueados, operações comuns sem manipulação manual, backups para operações suportadas. | Roadmap: `Status: final`, exit criteria; closure `E-20260528122615973830` + sessão `.agents/wb/260528_1145_f08-safe-file-mutation-undo/`; spec closure idem com verify estrito. | implemented |
| F-09 / `260521_0090_template-update-and-versioning_spec_01` | Roadmap F-09 (status final): lock de projeto, manifest gerenciado, update check/preview, detecção de conflito, preservação de edits locais. | Spec 0090 Acceptance: pode checar e pré-visualizar updates; edits de usuário preservados/flagged; arquivos managed atualizados com segurança; validação pós-update. | Roadmap: `Status: final`, exit criteria; closure evidence `5a1811fe...` e `6fc611a...`, sessão `.agents/wb/260528_2137_f09-closeout/`. | implemented |
| F-10 / `260521_0100_runtime-adapters-and-mcp_spec_01` | Roadmap F-10 (status final): adapters finos, MCP com ferramentas seguras, CLI/MCP no mesmo core, docs runtime mínimas. | Spec 0100 Acceptance: adapters finos, mapeamento MCP↔CLI via shared core, uso de MCP sem ler docs completos, paridade coberta por testes/benchmarks seletivos. | Roadmap: `Status: final`, exit criteria; closure `E-20260528134556147936` e sessão `.agents/wb/260528_1343_runtime-adapters-and-mcp/`; spec closure idem. | implemented |
| F-11 / `260521_0110_validation-ci-and-benchmarks_spec_01` | Roadmap F-11 (status final): type checks, unit/schema/parity, testes de export/workbench/MCP, benchmark packs para mudanças arriscadas; release claims com validações robustas. | Spec 0110 Acceptance: validam typecheck/unittests, template export, workbench, parity normalizada CLI/MCP, registro de cenários + tokens/baseline/host profile, política de CI com artefatos, gatilhos para mudanças arriscadas. | Roadmap: `Status: final`, closure com múltiplas sessões e evidências (`3a6456e`, `afe8a79`, `a1fa3e1`, etc.) e resultados por pack. Especificação declara waiver explícita para `runtime-live-agent` com `status=skipped` e razão `all-scenarios-skipped:not-implemented-live-runner`. | partial |
| F-12 / `260521_0120_public-distribution-and-onboarding_spec_01` | Roadmap F-12 (status final): fluxo de instalação/first-run/onboarding simples, docs curtas, `afol` público, validações de release antes de claims públicos. | Spec 0120 Acceptance: nova persona entende setup rápido; exemplo funciona; pressupostos privados removidos; pré-publicação exige `bun run build`, `bun run smoke:dist`, `bun install --frozen-lockfile` e smoke matrix por target. | Roadmap: `Status: final`, exit criteria; closure `E-20260528144544308053` e sessão `.agents/wb/260528_1444_public-distribution-and-onboarding/`; spec repete gates de release. Evidência de artefatos cross-target/checksum/notarization não está explícita no próprio doc. | partial |

# DOC_GAPS

- F-11 mantém status `final` com waiver explícito: o pack `runtime-live-agent` está com cenário `all-scenarios-skipped:not-implemented-live-runner`, então o fechamento não cobre cobertura completa exigida no mesmo item.
- F-07 e F-10 trazem follow-up documentado em 2026-05-31 (integração de lifecycle events/provider-neutral hooks) sem evidência de closeout dedicada no bloco atual de fechamento.
- F-12 declara gates de release (build/smoke/install/cross-target provenance/notarização) mas não referencia artifacts individuais desses checks no texto do fechamento, apenas ID de evidência agregado.

# MUST_ADD_TO_PLAN

- Incluir tarefa explícita para remover o waiver `runtime-live-agent` e fechar pacote de benchmark com runner vivo/equivalente + evidência de cenário executado por pack.
- Abrir/atualizar tarefa de implementação para o follow-up de lifecycle events (provider-neutral) em F-07 e F-10 com evidence-backed closeout.
- No fechamento de F-12, anexar evidência documental explícita por gate de distribuição pública (build/reproducibility/smoke matrix/cross-target + checksums/provenance/notarization).

# RISKS

- Claim de maturidade de validação pode estar superestimado (F-11 final com exceção ativa), o que reduz confiança para release claims e aumenta risco de regressão não detectada em runtime com MCP.
- Mudanças futuras podem assumir paridade e proteção completas de runtime sem que o follow-up de lifecycle events tenha sido testado/registrado.
- Rejeitar lacunas de evidence na distribuição pública pode gerar falso green administrativo no fechamento e risco de quebra de promessa em claims de release.

# COMMANDS_RUN

- `rg --files docs/arc/SPECS | rg '260521_(0070|0080|0090|0100|0110|0120)'`
- `sed -n '1,260p' docs/arc/GENERAL-ROADMAP.md`
- `sed -n '1,340p' docs/arc/260521_total-reformulation-execution-plan.md`
- `sed -n '1,260p' docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md`
- `sed -n '1,280p' docs/arc/SPECS/260521_0080_safe-file-mutation-and-undo_spec_01.md`
- `sed -n '1,280p' docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md`
- `sed -n '1,320p' docs/arc/SPECS/260521_0100_runtime-adapters-and-mcp_spec_01.md`
- `sed -n '1,320p' docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
- `sed -n '1,340p' docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md`
- `rg -n "^### F-|^status:|Exit criteria|Closure note|defer|deferred|waiver|waive|pending" docs/arc/GENERAL-ROADMAP.md`
- `rg -n "^#|##|###|status|acceptance|exit|closure|deferred|pending|waiver|waive|defer|evidence" docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md docs/arc/SPECS/260521_0080_safe-file-mutation-and-undo_spec_01.md docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md docs/arc/SPECS/260521_0100_runtime-adapters-and-mcp_spec_01.md docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md`
- `sed -n '245,330p' docs/arc/GENERAL-ROADMAP.md`
- `sed -n '54,90p' docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md`
- `sed -n '56,90p' docs/arc/SPECS/260521_0080_safe-file-mutation-and-undo_spec_01.md`
- `sed -n '58,95p' docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md`
- `sed -n '165,185p' docs/arc/SPECS/260521_0100_runtime-adapters-and-mcp_spec_01.md`
- `sed -n '373,410p' docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
- `sed -n '90,120p' docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md`
- `sed -n '350,372p' docs/arc/260521_total-reformulation-execution-plan.md`
- `sed -n '350,365p' docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md`
