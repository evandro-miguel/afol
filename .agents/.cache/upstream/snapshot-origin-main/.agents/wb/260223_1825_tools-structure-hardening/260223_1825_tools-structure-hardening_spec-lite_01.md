---
doc_type: spec-lite
id: 260223_1825_tools-structure-hardening_spec-lite_01
theme: tools-structure-hardening
status: active
owners:
- orchestrator
created_at: '2026-02-23T15:25:57-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
links:
  tasks: 260223_1825_tools-structure-hardening_task_01
  plan: 260223_1825_tools-structure-hardening_plan_01
  report: 260223_1825_tools-structure-hardening_report_01
risk_level: low
---

# SPEC LITE: tools-structure-hardening

## Objective

- Hardening dos scripts operacionais para que os comandos padrão do sistema de agentes funcionem sem falhas de execução.

## Change Summary

- `agents-lint-docs.py`: robustez no parse de frontmatter e impressão de paths; redução de falsos positivos.
- `agents-structure-map.py`: suporte a scan de `.agents/.agent` com ignorados explícitos.
- `agents-new.py`: correção do preenchimento de IDs e links em novos workstreams.

## Files and Areas

- `.agents/scripts/agents-lint-docs.py`
- `.agents/scripts/agents-structure-map.py`
- `.agents/scripts/agents-new.py`
- `.agents/arc/structure/*.md` (artefatos regenerados)

## Risks

- Regras de lint ainda podem gerar warnings históricos -> mitigado mantendo warnings informativos e sem bloquear execução.

## Verification

- Commands:
  - `make doctor`
  - `make lint`
  - `make structure`
  - `make new THEME=id-fix-check SPEC=lite`
- Evidence:
  - Registrada em `260223_1825_tools-structure-hardening_report_01`.

## Done When

- [x] Verified with commands
- [x] No regressions observed
- [x] Report updated with evidence

---

*Template: `.agents/a-docs/templates/spec-lite.md`*
