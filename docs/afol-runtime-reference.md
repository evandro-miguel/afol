---
doc_type: reference
id: afol_runtime_reference
status: active
created_at: '2026-06-17T00:00:00Z'
updated_at: '2026-06-18T00:00:00Z'
---

# AFOL Runtime Reference

This is the compact runtime map for operators and agents working in this
scaffold factory. `afol` is the supported public interface.

## Entrypoints

- `afol`: public shell wrapper.
- `bun run cli/main.ts`: development entrypoint.
- `dist/afol`: built CLI output.
- `cli/main.ts`, `cli/router.ts`, and `cli/registry.ts`: TypeScript command
  dispatch and command registry.

## Command Groups

Core:

```bash
afol status
afol validate project
afol init
afol new <theme> --feature-id <F-id> --parent-spec <spec-id>
```

Workflow:

```bash
afol start --session <session-id> --task-id <task-id>
afol evidence --session <session-id> --task-id <task-id> --command "<cmd>" --result passed
afol done --session <session-id> --task-id <task-id>
afol close --session <session-id>
afol verify-tasks .afol/wb/<session-id> --strict
```

Inspection:

```bash
afol local-state rebuild
afol pstr show
afol pstr stale
afol ctx
afol state show
afol hydrate --session <session-id>
afol spec list
afol adr list
```

Operations:

```bash
afol update check
afol update preview
afol update apply --dry-run
afol health
afol doctor
afol bench list
afol project-benchmark list
```

Use compact command output by default. Add `--json` only when a downstream tool
needs a field, and target that field instead of loading large payloads into
agent context.

## State Ownership

- `.afol/config.json`: static AFOL project configuration and root detection input.
- `.agents/lock.json`, `.agents/manifest.json`: static scaffold metadata.
- `.afol/adm/hooks/**`: static provider-neutral hook catalog.
- `.afol/adm/rules/**`: static local contracts.
- `.afol/adm/source/**`: static source seed content.
- `.agents/skills/**`: project-local provider skills. `paths.skills_dir` must
  stay here or in a child path; `.afol/skills/**` is not an active skills root.
- `.afol/adm/**`: project direction, roadmap, specs, ADRs, strategy, and
  desired-state administration.
- `.afol/pstr/**`: generated project-structure maps when present.
- `.afol/wb/**`: governed execution sessions.
- `.afol/data/events/**`: append-only runtime event data.
- `.afol/data/index/**`: local indexes.
- `.afol/data/mutations/**`: mutation and update records.
- `.afol/state/afol.db`: local state database.
- `.afol/tmp/**`: temporary AFOL-owned files.
- `.afol/library/**` and `.afol/memory/**`: local knowledge and memory surfaces.

## Rule Injection

- `afol ctx bundle` is the only context command that can persist first-use rule
  injection state for an identity.
- Identity dimensions are `session`, `task`, `role`, `surface`, and optional
  `file`; missing session/task collapse to `none`, and the file dimension is
  omitted when no file is present.
- `afol ctx explain`, `afol ctx tools`, and `afol ctx bundle --mode compact`
  resolve context without consuming first-use injection state.
- Rule metadata can target `domains`, `surfaces`, `work_types`, `languages`,
  `file_globs`, and `exact_files`; only rules marked `inject: "always"` are
  eligible for injection.
- Resolver limits come from `.afol/config.json` under
  `rules.resolver.max_chars_per_rule` and `rules.resolver.max_chars_total`;
  `.agents/config.json` is accepted only as a legacy fallback. Defaults are
  `2000` and `4000`.
- Persistent state lives at `.afol/data/rules/injection-state.json`, is
  serialized under the rule-injection lock, and is written atomically.
- Missing optional rule markdown is omitted with a reason; missing required
  rule markdown fails loudly; invalid injection state or invalid rules index
  also fails loudly.
- `.afol/adm/rules/**` content is static and must not be edited unless the user
  explicitly requests a rule-content change.

## Hooks

Hooks are declarative context contributions stored in `.afol/adm/hooks/index.json`.
They are provider-neutral metadata, not executable plugins.

- `afol hook list`, `afol hook show <id>`, and `afol hook resolve` inspect the
  static hook catalog.
- `afol ctx bundle` resolves hooks for the `context.bundle` event using the same
  delivery dimensions used by rules: role, surface, work type, scope, language,
  and optional file path.
- Hook entries may target `events`, `roles`, `surfaces`, `work_types`,
  `languages`, `file_globs`, `exact_files`, and optional `scope`.
- Contributions may add `messages`, `tools`, `validation_commands`,
  `pstr_refs`, `memory_refs`, `library_refs`, and `do_not_load` guidance to the
  context bundle.
- Resolver limits come from `.afol/config.json` under
  `hooks.resolver.max_chars_per_message` and `hooks.resolver.max_chars_total`;
  `.agents/config.json` is accepted only as a legacy fallback. Defaults are
  `1000` and `3000`.
- Missing `.afol/adm/hooks/index.json` means no hooks. Invalid JSON is ignored by
  default listing but fails in strict resolver paths.
- Hooks do not execute scripts, install skills/plugins, write lifecycle state,
  or publish adapter side effects. Future lifecycle hooks must enter through
  AFOL core event handling, not adapter-local trigger code or `.agents/scripts`.

## Validation Gates

Use the smallest gate that proves the change.

```bash
afol validate project
bun run typecheck
bun test
bun run validate
bun run validate:project-benchmarks
bun run validate:release
```

For release or scaffold-boundary work, run the broader release gates from
`.afol/adm/doctrine/RELEASE-RUNBOOK.md`.

## Retired Runtime Paths

Do not use the old `.agents` command/runtime system:

- `.agents/agents`
- `.agents/scripts/**`
- `.agents/runtime/**`
- `.agents/wb/**`
- `.agents/z-arq/**`
- `legacy:` command routing
