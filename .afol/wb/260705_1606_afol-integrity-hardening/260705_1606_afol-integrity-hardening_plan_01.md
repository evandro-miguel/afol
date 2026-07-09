# Plan: afol-integrity-hardening

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-18
- parent_spec: 260612_agent-operational-state-context-library_spec_01
- task: Implementar pending_spec, frontmatter governado e bloqueio de novas sessoes quando houver pendencias abertas
- task: Corrigir hydrate/state para persistir todas as tasks geradas pelo AFOL
- task: Alinhar CI, release runbook e health release gate
- task: Fortalecer benchmark side-effect guard para paths ignorados criticos
- task: Reconciliar SQLite v1 docs/promessa e limpar contradicoes de legado/mutable-dir/manifest
- task: Corrigir file mutation: patch append, hashes binarios e protected paths
- task: Rodar validacoes, registrar evidencias e fechar o workstream

## Execution Plan

- T-01: Implementar pending_spec, frontmatter governado e bloqueio de novas sessoes quando houver pendencias abertas
- T-02: Corrigir hydrate/state para persistir todas as tasks geradas pelo AFOL
- T-03: Alinhar CI, release runbook e health release gate
- T-04: Fortalecer benchmark side-effect guard para paths ignorados criticos
- T-05: Reconciliar SQLite v1 docs/promessa e limpar contradicoes de legado/mutable-dir/manifest
- T-06: Corrigir file mutation: patch append, hashes binarios e protected paths
- T-07: Rodar validacoes, registrar evidencias e fechar o workstream
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
