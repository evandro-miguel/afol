---
doc_type: plan
id: "260618_0728_library-memory-hardening_plan_01"
theme: "library-memory-hardening"
status: draft
owners: ["orchestrator"]
created_at: "2026-06-18T11:33:55Z"
updated_at: "2026-06-18T11:33:55Z"
---

# Plan: library-memory-hardening

## Objective

- Harden the agent-facing library/memory/template path so retrieval is usable, duplicate data is not silently lost, and a fresh project stays healthy.

## Facts

- `cli/services/context/bundler.ts` builds `memory_refs` and `library_refs` from `bundleSearchQuery(taskId, surface, role)`, so the task id can starve library/memory matches.
- `cli/services/library/crud.ts` writes `proposeTopic()` by replacing `INDEX.md` unconditionally, which can drop existing claims and sources for an existing slug.
- `src/project-template/.afol/memory/memory.md` is missing, and `cli/schemas/template-policy.ts` does not currently allow `.afol/memory/**`.
- `cli/services/memory/crud.ts` allows duplicate ids through `addEntry()` and `promoteEntry()` can return success without changing status when the entry is not promotable.

## Scope

- In scope: ctx bundle selection, library propose conflict handling, memory id/status integrity, exportable template coverage, and task evidence/closure.
- Out of scope: unrelated command routing, broad refactors, legacy `.agents` runtime surfaces, and non-WB docs.

## Success Criteria

- `ctx bundle` returns usable `refs`, `memory_refs`, and `library_refs` without losing hits to the task id join.
- `library propose` on an existing slug does not delete claims or sources and reports an explicit conflict or merge decision.
- Fresh template output contains `.afol/memory/memory.md`, the template policy accepts it, and a new project passes memory health.
- Memory commands do not silently operate on duplicate ids, and `memory promote` only reports success when status actually changes.
- Mutating library/memory commands still block under `AFOL_AGENT=1`.

## Delivery Strategy

1. T-02: Fix agent-facing library/memory retrieval and data integrity.
- Target files: `cli/services/context/bundler.ts`, `cli/services/library/crud.ts`, `cli/commands/library.ts`, `cli/services/memory/crud.ts`, `cli/commands/memory.ts`, `cli/tests/context-system.test.ts`, `cli/tests/library-system.test.ts`, `cli/tests/memory-crud.test.ts`, `cli/tests/memory-command.test.ts`, `cli/tests/operation-context.test.ts` if gate wording changes.
- Outcome: split ctx query behavior so task-specific context does not suppress library/memory refs; make duplicate library/memory state fail loudly or merge deterministically; keep `AFOL_AGENT=1` mutation gating intact.
- Validate: focused `bun test` on the listed ctx/library/memory specs, then `bun run typecheck`.

2. T-03: Update docs/template coverage for library/memory flows.
- Target files: `src/project-template/.afol/memory/memory.md`, `cli/generated/template.ts`, `cli/schemas/template-policy.ts`, `cli/tests/template-policy.test.ts`, `cli/tests/bootstrap.test.ts`, `cli/tests/downstream-smoke.test.ts`, `cli/tests/health-system.test.ts`, `cli/tests/validate-command.test.ts`.
- Outcome: exportable template ships memory state by default, the allowlist admits it, bootstrap/downstream fixtures carry it, and new-project memory health does not fail.
- Validate: focused `bun test` on template/bootstrap/health specs, then `afol validate project --json`, then `bun run validate:release`.

3. T-04: Validate library/memory flows and close evidence.
- Target files: `.afol/wb/260618_0728_library-memory-hardening/.evidence.jsonl`, `.afol/wb/260618_0728_library-memory-hardening/260618_0728_library-memory-hardening_task_01.md`, `.afol/wb/260618_0728_library-memory-hardening/260618_0728_library-memory-hardening_log_01.md`.
- Outcome: record passed evidence for the focused checks, mark the task board done, run strict task verification, and close the session.
- Validate: `afol verify-tasks --strict` and `afol close --session 260618_0728_library-memory-hardening`.

## Critical Dependencies

- Tools: `afol`, `bun`, `rg`, `jq`
- Skills: `agentic-folder-sys`, `code-discovery`, `rtk-token-optimization`
- Executor rule: if a task discovers a broader contract break, record the concrete file and keep the fix scoped to the smallest safe surface.

## Risks and Mitigations

- Risk: query narrowing still hides useful refs -> Mitigation: keep a fallback path and prove it with a fixture that has library/memory hits.
- Risk: duplicate topics or entries already exist in repo state -> Mitigation: make the commands fail explicitly instead of silently overwriting.
- Risk: adding the template memory file breaks template policy or generated output -> Mitigation: update the allowlist and regenerate `cli/generated/template.ts` together.
- Risk: health passes in tests but not in a fresh bootstrap -> Mitigation: assert the bootstrap target has `.afol/memory/memory.md` before relying on health.

## Verification Plan

- Unit: `bun test cli/tests/context-system.test.ts cli/tests/library-system.test.ts cli/tests/memory-crud.test.ts cli/tests/memory-command.test.ts`
- Template/health: `bun test cli/tests/template-policy.test.ts cli/tests/bootstrap.test.ts cli/tests/downstream-smoke.test.ts cli/tests/health-system.test.ts cli/tests/validate-command.test.ts`
- Project: `afol validate project --json`
- Release: `bun run validate:release`
- Closeout: `afol verify-tasks --strict` then `afol close --session 260618_0728_library-memory-hardening`
