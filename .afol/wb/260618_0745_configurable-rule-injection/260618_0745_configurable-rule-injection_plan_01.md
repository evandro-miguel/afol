---
doc_type: plan
id: "260618_0745_configurable-rule-injection_plan_01"
theme: "configurable-rule-injection"
status: draft
owners: ["orchestrator"]
created_at: "2026-06-18T11:45:26Z"
updated_at: "2026-06-18T11:59:18Z"
---

# Plan: configurable-rule-injection

## Objective

- Add a configurable rule-resolution and first-use injection mechanism that can select applicable rules by global, domain, surface, work type, language, glob, and exact file scope.
- Enforce hard character limits: 2000 chars max per rule and 4000 chars max injected per agent context, both configurable in project config.
- Keep rule content immutable unless the user directly asks to edit rules.

## Execution Contract

- Build on the existing `rule`/`ctx`/`preflight` surfaces instead of adding a parallel routing path.
- Treat `.agents/rules/**` as static input; do not rewrite rule content in this workstream.
- Store mutable injection state under `.afol/**` only.
- Make every phase executable now, with a concrete owner, target files, and validation.

## Scope

- In scope:
  - config schema for rule budgets and routing knobs;
  - rule index schema extensions for domain/surface/work type/language/glob/exact file;
  - first-use injection state keyed by session/task/agent/rule;
  - budget enforcement and omission/error reporting;
  - bundle/preflight wiring and tests.
- Out of scope:
  - editing rule documents themselves;
  - restoring retired `.agents` runtime surfaces;
  - hidden global overrides or external shell interception;
  - broad refactors outside the rule/context path.

## Facts

- `.agents/config.json` already owns the mutable path contract and points `wb_dir` at `.afol/wb`.
- `.agents/rules/index.json` currently only carries `surfaces`, `work_types`, and `priority`.
- `cli/services/catalog/rules.ts` resolves rules only by surface plus work type.
- `cli/services/context/bundler.ts` currently injects rule ids by surface only.
- `cli/commands/preflight.ts` already surfaces matching rules for an intent query, so it is a reuse point for resolution logic.
- `RULE-006-applicable-rule-resolution.md` requires agents to load applicable guidance before touching an element.

## Success Criteria

- A rule can match by global, domain, surface, work type, language, glob, or exact file.
- The first matching execution context receives rule payloads once; later matches return references only.
- No injected rule exceeds 2000 chars and no agent context exceeds 4000 chars unless the config raises the limit.
- Optional overflow rules are omitted with reasons; required overflow rules fail loudly.
- The plan can be executed through the existing AFOL surfaces and validated with narrow tests plus `afol validate project`.

## Delivery Strategy

1. T-02: lock the shared rule schema and resolver contract.
- Scope: `.agents/config.json`, `.agents/rules/index.json`, `cli/services/catalog/rules.ts`, `cli/commands/catalog.ts`, `cli/tests/rule-command.test.ts`.
- Outcome: the catalog and config can express the new routing dimensions and precedence without breaking existing surface/work-type resolution.
- Validate: focused `bun test cli/tests/rule-command.test.ts cli/tests/local-state-indexes.test.ts` and any resolver-specific tests added in the same lane.

2. T-03: wire first-use injection and budget enforcement into the runtime bundle path.
- Scope: `cli/services/context/bundler.ts`, `cli/commands/context.ts`, `cli/commands/preflight.ts`, new `cli/services/rules/**` or equivalent runtime helper, `cli/tests/context-system.test.ts`, `cli/tests/preflight-command.test.ts`.
- Outcome: the first matching agent context gets payloads, repeat contexts get references only, and budget overflow is handled by omission or explicit failure as required.
- Validate: focused `bun test` on context/preflight/rule-injection coverage, then `bun run typecheck`.

3. T-04: prove the end-to-end behavior and close the WB.
- Scope: `.afol/wb/260618_0745_configurable-rule-injection/**` only for evidence/log/task bookkeeping.
- Outcome: record the verification evidence, update the task board state, run strict task verification, and leave the session ready for implementation handoff.
- Validate: `./afol validate project`, `./afol verify-tasks --strict`, and `./afol close --session 260618_0745_configurable-rule-injection` after evidence lands.

## Critical Dependencies

- Tools: `afol`, `bun`, `rg`, `jq`
- Skills: `agentic-folder-sys`, `plan-review`, `rtk-token-optimization`, `caveman`
- Executor rule: if the contract needs a new helper module, keep the helper local to the rule/context path and do not split into a second routing system.

## Risks and Mitigations

- Risk: the new dimensions drift from the existing catalog format -> Mitigation: extend the index schema incrementally and keep the old surface/work-type path working.
- Risk: budget trimming silently drops required rules -> Mitigation: fail required matches explicitly and report omitted optional rules.
- Risk: first-use tracking leaks across sessions or agents -> Mitigation: key state by projectRoot/session/task/agent/rule and test repeat invocations.
- Risk: rule content gets edited as part of the implementation -> Mitigation: keep `.agents/rules/**` out of scope unless the user asks for rule edits directly.

## Verification Plan

- Unit: focused `bun test` coverage for catalog resolution, context bundle selection, and preflight rule matching.
- Integration: end-to-end `bun test` coverage for first-use injection, duplicate invocation behavior, and budget overflow paths.
- AFOL: `./afol validate project`, `./afol verify-tasks --strict`, then `./afol close --session 260618_0745_configurable-rule-injection`.
