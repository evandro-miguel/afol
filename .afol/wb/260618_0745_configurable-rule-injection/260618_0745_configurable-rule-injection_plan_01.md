---
doc_type: plan
id: "260618_0745_configurable-rule-injection_plan_01"
theme: "configurable-rule-injection"
status: draft
owners: ["orchestrator"]
created_at: "2026-06-18T11:45:26Z"
updated_at: "2026-06-18T11:45:26Z"
---

# Plan: Configurable Rule Injection

## Objective

- Build an AFOL rule-resolution and injection mechanism that can inject
  applicable rule content into an agent context the first time that agent is
  about to execute work for a task.
- Support optional rules at multiple levels: global, domain, surface,
  work type, language, file glob, and exact file.
- Enforce configurable character budgets:
  - default max per injected rule: 2000 characters;
  - default max total injected rule content per agent context: 4000 characters.
- Keep all budget and injection behavior configurable from project config.

## Non-Goals

- Do not edit `.agents/rules/**` content unless the user directly asks for rule
  edits in that turn.
- Do not restore or extend retired `.agents` runtime surfaces.
- Do not assume AFOL can intercept arbitrary external shell commands. Injection
  is guaranteed only through AFOL context/handoff entrypoints that agents call
  before execution.
- Do not silently truncate rule content.

## Current Constraints

- AFOL paths must come from `.agents/config.json`; do not hardcode mutable
  state paths.
- Mutable injection state must live under `.afol/**`, not `.agents/**`.
- `.agents/rules/**` remains static metadata and rule content.
- Existing rule docs may exceed the new 2000-character rule payload budget.
  Implementation must report those violations, not rewrite the rules.

## Proposed Config Contract

Add a configurable rules block to `.agents/config.json` and the downstream
template config:

```json
{
  "rules": {
    "injection": {
      "enabled": true,
      "default_mode": "first_use",
      "per_rule_max_chars": 2000,
      "per_agent_total_max_chars": 4000,
      "count_frontmatter": false,
      "on_budget_exceeded": "omit_optional_fail_required",
      "state_dir": ".afol/data/context/rule-injections"
    },
    "resolver": {
      "global_domains": ["global"],
      "known_domains": [
        "frontend",
        "backend",
        "api",
        "devops",
        "docker",
        "testing",
        "docs"
      ],
      "default_work_type": "delivery",
      "default_inject": "first_use"
    }
  }
}
```

Notes:

- Users may change limits in config without code changes.
- `per_agent_total_max_chars` is a hard cap. AFOL must never inject more than
  this total rule payload into one agent context.
- `per_rule_max_chars` is a hard cap for each injectable rule payload.
- `count_frontmatter: false` means YAML frontmatter is metadata and does not
  count toward the default rule content budget.
- `on_budget_exceeded` behavior:
  - required matching rules that cannot fit block injection with an actionable
    error;
  - optional matching rules that cannot fit are returned as references under
    `omitted_rules`, not injected.

## Rule Index Schema

Extend `.agents/rules/index.json` entries with optional routing fields while
preserving current `surfaces` and `work_types` behavior:

```json
{
  "id": "RULE-FE-001",
  "name": "frontend-state-boundaries",
  "path": "domains/frontend/RULE-FE-001.md",
  "priority": 90,
  "scope": "domain",
  "required": false,
  "domains": ["frontend"],
  "surfaces": ["ui", "app"],
  "work_types": ["implementation", "delivery"],
  "languages": ["typescript", "tsx"],
  "file_globs": ["src/**/*.tsx", "app/**/*.tsx"],
  "exact_files": [],
  "inject": "first_use"
}
```

Optional fields:

- `scope`: `global`, `domain`, `language`, `surface`, `path`, `file`.
- `required`: when true, matching rule must be injected or the command fails.
- `domains`: examples include `frontend`, `backend`, `api`, `devops`,
  `docker`, `testing`, and `docs`.
- `languages`: examples include `typescript`, `tsx`, `javascript`, `python`,
  `markdown`, `json`, and `shell`.
- `file_globs`: repo-relative glob patterns.
- `exact_files`: repo-relative file paths.
- `inject`: `first_use`, `always`, `reference_only`, or `never`.

The directory layout under `.agents/rules/` may be organized for humans:

```text
.agents/rules/
├── global/
├── domains/
│   ├── frontend/
│   ├── backend/
│   ├── api/
│   ├── devops/
│   └── docker/
├── languages/
│   ├── typescript/
│   ├── python/
│   └── markdown/
└── files/
```

The index remains authoritative. Folder placement alone must not create hidden
routing behavior.

## Resolution Semantics

Create a resolver that accepts:

```text
session
taskId
agentId or role
surface
workType
domains
files
commandIntent
```

Resolution order:

1. Global rules.
2. Explicit or inferred domain rules.
3. Surface and work-type rules.
4. Language rules inferred from file extension.
5. File glob rules.
6. Exact file rules.

Ordering inside the final result:

1. required rules before optional rules;
2. higher `priority` first;
3. more specific match first: exact file, glob, language, domain, global;
4. stable `id` sort as final tie-breaker.

Domain inference examples:

- `.tsx`, `components/**`, `ui/**`, `app/**`: frontend.
- `api/**`, `routes/**`, `controllers/**`: api.
- `server/**`, `services/**`, `db/**`: backend.
- `Dockerfile`, `docker/**`, `compose*.yml`: docker.
- `.github/**`, `infra/**`, `deploy/**`: devops.

All inferred domains are optional. Missing domain-specific rules must not fail
the command.

## Injection Semantics

Injection key:

```text
projectRoot + session + taskId + agentIdOrRole + ruleId
```

First matching execution context:

- return rule payload content under `rule_payloads`;
- append an injection event under configured `.afol/**` state.

Later matching execution contexts for the same key:

- return rule IDs and paths only;
- include `already_injected: true`.

The output contract should include:

```json
{
  "rules": ["RULE-001"],
  "rule_payloads": [
    {
      "id": "RULE-001",
      "path": ".agents/rules/global/RULE-001.md",
      "chars": 1300,
      "match_reasons": ["global", "typescript"]
    }
  ],
  "omitted_rules": [
    {
      "id": "RULE-FE-009",
      "reason": "budget_exceeded",
      "chars": 1800
    }
  ],
  "rules_already_injected": []
}
```

Budget rules:

- Never inject total rule payload above `per_agent_total_max_chars`.
- Never inject a single rule above `per_rule_max_chars`.
- Never truncate content to fit a budget.
- If optional matches exceed budget, omit lower-priority optional rules and
  report them.
- If a required match cannot fit, fail with a compact error listing the rule,
  configured limit, actual size, and suggested next action.

## Target Files And Surfaces

Expected implementation targets:

- `cli/services/catalog/rules.ts`: extend rule metadata parsing while preserving
  existing fields.
- `cli/services/rules/resolver.ts`: new resolver for domains, languages,
  globs, exact files, and priorities.
- `cli/services/rules/injection-state.ts`: new append/read state for first-use
  injection tracking under configured `.afol/**`.
- `cli/services/context/bundler.ts`: include first-use payloads and omitted
  rule references in context bundles.
- `cli/services/preflight/search.ts`: use configured `paths.rulesDir`, not a
  hardcoded `.agents/rules`.
- `cli/services/project/paths.ts` or config loader: expose rule-injection
  config with defaults.
- `cli/services/project/validate.ts`: validate rule schema, file existence,
  duplicate IDs, glob syntax, and character budgets.
- `src/project-template/.agents/config.json`: include default configurable
  limits.
- `src/project-template/.agents/rules/index.json`: remain valid under the new
  schema.

Forbidden implementation targets unless separately requested:

- `.agents/rules/**/*.md` content edits.
- legacy `.agents/runtime`, `.agents/scripts`, `.agents/agents`, `.agents/wb`,
  `.agents/z-arq`, or `agents.config`.

## Task Sequence

### T-01: Config and Types

Owner: executor.

Actions:

- Add typed config defaults for rule injection limits and resolver behavior.
- Read values from `.agents/config.json`.
- Keep all defaults compatible with current repos that lack the new block.

Validate:

- `bun test cli/tests/project-paths.test.ts cli/tests/context-system.test.ts`
- `bun run typecheck`

### T-02: Rule Metadata Schema

Owner: executor.

Actions:

- Extend rule metadata parsing for optional fields.
- Preserve existing `surfaces`, `work_types`, and `priority` behavior.
- Add schema validation errors for duplicate IDs, missing files, invalid paths,
  invalid inject modes, and invalid glob patterns.

Validate:

- `bun test cli/tests/rule-command.test.ts`
- Add focused schema tests.

### T-03: Resolver

Owner: executor.

Actions:

- Implement resolver matching for global, domain, surface, work type, language,
  glob, and exact file rules.
- Add match reasons to every resolved rule.
- Sort by required, priority, specificity, and ID.

Validate:

- Add tests for TS, TSX/frontend, API, Docker, DevOps, exact file, and missing
  optional domain rules.

### T-04: First-Use Injection State

Owner: executor.

Actions:

- Store first-use injection events under configured `.afol/**` state.
- Key events by project, session, task, agent/role, and rule ID.
- Make reads/writes append-safe and compact.

Validate:

- Test first call injects content.
- Test second call for same key returns reference only.
- Test different task or agent receives fresh injection.

### T-05: Context Bundle Integration

Owner: executor.

Actions:

- Add file-aware rule injection to `ctx bundle`.
- Support explicit file inputs and task-derived files when available.
- Return `rule_payloads`, `omitted_rules`, and `rules_already_injected`.
- Preserve compact mode by omitting payloads unless explicitly requested or
  unless the mode is designed for execution handoff.

Validate:

- `bun test cli/tests/context-system.test.ts`
- Add tests for budget cap and first-use behavior.

### T-06: Preflight And Validation

Owner: executor.

Actions:

- Update preflight rule lookup to use configured `rulesDir`.
- Update project validation to enforce rule schema and character budgets.
- Ensure validation reports existing oversized rules without editing them.

Validate:

- `bun test cli/tests/preflight-command.test.ts`
- `./afol validate project`

### T-07: Template Defaults

Owner: executor.

Actions:

- Add default `rules.injection` config to the project template.
- Keep template rules valid under the new schema.
- Do not edit template rule content unless the user explicitly approves that
  content change.

Validate:

- `bun test cli/tests/template-policy.test.ts cli/tests/bootstrap-template-cleanliness.test.ts`
- `bun run validate:bootstrap`

### T-08: Final Gates

Owner: reviewer.

Actions:

- Verify no forbidden legacy surfaces were reintroduced.
- Verify no `.agents/rules/**/*.md` content was changed without explicit user
  request.
- Verify rule payload budgets are enforced by tests and project validation.

Validate:

- `afol local-state rebuild --json`
- `afol validate project --json`
- `bun run typecheck`
- `bun test`
- `bun run validate:release`

## Success Criteria

- Users can configure per-rule and per-agent rule-injection character limits in
  `.agents/config.json`.
- Default per-rule limit is 2000 characters.
- Default total rule payload limit per agent context is 4000 characters.
- The resolver supports optional rules for frontend, backend, API, DevOps,
  Docker, language, glob, and exact file targets.
- Missing optional domain rules do not fail execution.
- Matching rules inject content only on first use for the same
  session/task/agent/rule key.
- AFOL never injects more than the configured total rule character budget.
- Runtime commands do not edit `.agents/rules/**`.
- Validation catches invalid rule metadata and oversized injectable rules.

## Risks And Mitigations

- Risk: rules become too complex to reason about.
  Mitigation: keep `index.json` authoritative, include match reasons in output,
  and add deterministic sorting tests.

- Risk: large rule sets exceed token budgets.
  Mitigation: enforce per-rule and per-agent character caps, omit optional
  lower-priority rules, and fail required oversized rules.

- Risk: users expect injection to happen without agents calling AFOL.
  Mitigation: document that injection is guaranteed through AFOL context and
  handoff entrypoints.

- Risk: current rules exceed 2000 characters.
  Mitigation: validation reports the violation; content edits require a direct
  user request.

- Risk: config drift between root repo and template.
  Mitigation: update both configs and cover template bootstrap tests.

## Verification Plan

- Unit:
  - `bun test cli/tests/rule-command.test.ts`
  - `bun test cli/tests/context-system.test.ts`
  - `bun test cli/tests/preflight-command.test.ts`
  - new resolver and injection-state tests

- Project checks:
  - `./afol validate project`
  - `bun run typecheck`

- Release gates:
  - `afol local-state rebuild --json`
  - `afol validate project --json`
  - `bun test`
  - `bun run validate:release`

