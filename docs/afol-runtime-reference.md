---
doc_type: reference
id: afol_runtime_reference
status: active
created_at: '2026-06-17T00:00:00Z'
updated_at: '2026-08-21T14:00:20Z'
---

# AFOL Runtime Reference

This is the compact runtime map for operators and agents working in this
scaffold factory. `afol` is the supported public interface.

## Entrypoints

- `$HOME/.local/bin/afol`: installed public CLI; a real compiled executable,
  never a wrapper or symlink into this repository.
- `./afol` and `bun run cli/main.ts`: repository-local development entrypoints.
- `dist/afol`: compiled release artifact.
- `cli/main.ts`, `cli/router.ts`, and `cli/registry.ts`: TypeScript command
  dispatch and command registry.

## Command Groups

Core:

```bash
afol status
afol catchup [--session <session-id>]
afol validate project
afol init
afol new <theme> --feature-id <F-id> --parent-spec <spec-id>
```

Workflow:

```bash
afol start --session <session-id> --task-id <task-id>
afol done --session <session-id> --task-id <task-id> --test-shell "<cmd>"
afol close --session <session-id> --summary "<summary>"
afol verify-tasks .afol/wb/<session-id> --strict
```

Compact single-session agent path:

```bash
afol st T-01
afol d T-01 -x "<cmd>"
afol c -m "<summary>"
```

Shared-check batch path:

```bash
afol st T-01..T-10
afol d T-01..T-10 -x "<shared-cmd>"
```

The batch path runs one observed check and records one evidence entry per
selected execution-policy task.

`afol status` has an optional `--catchup` flag to include the same session
freshness checks as `afol catchup`.

`afol status` output now includes compact summary lines:

- `PROBLEM_REASON`: emitted only when a canonical blocker reason is available in
  task `State Board` notes as `reason=<urlencoded>`, for `problem` state.
- `BLOCKERS` reflects task-local blockers from the boarded state. Global/state
  health findings remain `WARNINGS`.
- `SAFE_NEXT_ACTION`: emitted when a concrete next action is available; omitted
  when no practical next action can be compacted.

Auxiliary index/health findings are surfaced as `WARNINGS` and do not replace
`BLOCKERS` content unless the task explicitly declares blockers.

### Hardening behavior

- `catchup` and `status --catchup` report:
  - `git_changed_files_degraded: true` when the Git status query fails, even
    when supplemental diff results remain available
  - `degraded: git unavailable, state unknown` when git cannot be queried
  - `degraded: git status query failed, state uncertain` when the porcelain
    status query fails
- `afol catchup` output marks the change count as `(degraded)` when git query
  health is uncertain.
- `afol status` with `--health` keeps freshness/index issues in warnings and
  keeps the legacy blocker/next pair focused on lifecycle task blockers.
- If session-health collection fails as a whole, `afol status` reports
  `SESSIONS: unavailable` and a warning entry:
  - `unavailable: session health collection failed`
- `afol status --json` exposes that collection-wide failure as
  `session_count: null` and `session_health_warnings`, both under `data` and
  through the legacy root keys.
- If one child session directory is unreadable but the workbench root remains
  listable, the session count stays numeric and `session_health_warnings`
  includes `unavailable: session directory unreadable: <session-id>`.

Declared `evidence --result passed` is useful for recording claims, but only
observed exit-zero evidence authorizes completion. `d -x "<argv command>"`
executes without a shell; use `done --test-shell "<shell expression>"` when the
verification requires `&&`, pipes, redirection, or other shell syntax.

Inspection:

```bash
afol local-state rebuild
afol pstr show
afol pstr stale
afol ctx
afol state show
afol hydrate --session <session-id>
afol evolve status
afol spec list
afol adr list
```

Operations:

```bash
afol update check
afol update preview
afol update apply --dry-run
afol fleet check --root /absolute/project/root
afol fleet repair --derived --dry-run --root /absolute/project/root
afol health
afol doctor
afol bench list
afol project-benchmark list
```

Use compact command output by default. Add `--json` only when a downstream tool
needs a field, and target that field instead of loading large payloads into
agent context.

`fleet check` accepts up to 25 explicit absolute roots and reports compact
update, health, validation, Git, and derived-state posture without changing the
projects. `fleet repair --derived` never applies scaffold updates or resolves
conflicts. Preview first; a real repair also requires `--reason` and is eligible
only for a recognized AFOL project whose failure is limited to rebuildable
local state.

## State Ownership

- `.afol/config.json`: static AFOL project configuration and root detection input.
- `pstr.areas`: optional additive PSTR area registry. An empty array preserves
  the four built-in areas; configured entries must use safe IDs/scopes/tags and
  project-contained relative source roots.
- `.agents/lock.json`, `.agents/manifest.json`: static scaffold metadata.
- `.afol/adm/hooks/**`: static provider-neutral hook catalog.
- `.afol/adm/rules/**`: static local contracts.
- `.afol/adm/source/**`: static source seed content.
- `.agents/skills/**`: optional project-local provider skills. `paths.skills_dir`
  must stay here or in a child path; `.afol/skills/**` is not an active skills
  root. Universal AFOL behavior uses global Codex skills such as
  `agentic-folder-sys`, not a vendored project-local copy.
- `.afol/adm/**`: project direction, roadmap, specs, ADRs, strategy, and
  desired-state administration.
- `.afol/pstr/**`: generated project-structure maps when present.
- `.afol/wb/**`: governed execution sessions.
- `.afol/data/events/**`: append-only runtime event data.
- `.afol/data/events/evolution/**`: canonical append-only evolution evidence
  journal; derived databases never replace it.
- `.afol/data/index/**`: local indexes.
- `.afol/data/mutations/**`: mutation and update records.
- `.afol/state/afol.db`: SQLite v1 local state database.
- `.afol/state/evolution.db`: separately migrated, rebuildable evolution
  projection with explicit `PRAGMA user_version` migrations.
- `.afol/tmp/**`: temporary AFOL-owned files.
- `.afol/library/**` and `.afol/memory/**`: local knowledge and memory surfaces.

PSTR keeps four built-in maps by default. Projects may add observed maps
through the optional `pstr.areas` registry:

```json
{
  "pstr": {
    "areas": [
      {
        "id": "os",
        "scope": "os",
        "source_roots": ["src/os/"],
        "tags": ["os"]
      }
    ]
  }
}
```

Entries are additive and sorted by ID after the defaults. IDs, scopes, and tags
must be safe tokens; source roots must be relative, project-contained, and
outside `.afol/**`.

`.afol/state/afol.db` is the SQLite v1 surface. It materializes workbench
sessions, task rows, source hashes, and evidence only. Broader
`adm/pstr/memory/library/ctx` materialization is State DB v2/future.

### Legacy project opt-in

Projects without `project.id`, `project.timezone`, the four evolution path
keys, and the `evolution` object remain valid and report
`legacy_unconfigured`. AFOL does not silently rewrite their project-owned
configuration during bootstrap or update.

Opt-in is an explicit configuration change. Generate one stable UUID with
`bun -e 'console.log(crypto.randomUUID())'`, choose the project's IANA
timezone, then copy `project.id`, `project.timezone`,
`paths.external_dir`, `paths.evolution_db`, `paths.evolution_data_dir`,
`paths.evolution_events_dir`, and the complete `evolution` object from
`src/project-template/.afol/config.json` into `.afol/config.json`. Preserve the
existing `project.name` and unrelated configuration. Validate the approved
edit before using the derived state:

```bash
afol validate project --json
afol doctor --json
afol evolve status --json
```

The expected final state is `ready_uninitialized`; status must not create the
database. The first verified production event creates the rebuildable
projection in a later observation flow.

## Governance

- `afol new` without `--feature-id`/`--parent-spec` creates the session with
  `pending_spec` plus warnings; open `pending_spec` entries do not block other
  new sessions.
- The current `pending_spec` session can continue through `start`, `evidence`,
  `done`, and `close`; lifecycle commands emit warnings until the pending spec
  is resolved or waived, and `close` remains allowed.
- `afol status` and `afol validate project` warn while open pending specs
  exist; resolving or waiving is still recommended.
- Prefer `afol qt` for micro one-shot work; multi-task slices may use repeated
  `-t` with one `-c`, or the `n` / `st` / `d -x` / `c` path when qt is not enough.
- Hygiene warnings (`afol health`, maintenance, open pending, stale reviews)
  must not stop feature lifecycle mid-delivery. Lifecycle hard blocks remain:
  done without observed evidence, close with open tasks, CI ambiguous session,
  and corrupt context binding (`afol catchup --fix` for safe unbind/rebind).

```bash
afol governance pending --json
afol gov rs -S <session-id> -F <F-id> -P <spec-id>
afol gov af -F <F-id> [-P <spec-id>]
afol gov rs -S <session-id> --no-spec-required -r "<reason>"
afol gov bulk-waive -r "<reason>" [--limit 20] [--dry-run]
afol catchup
afol catchup --fix
```

`afol gov af` (`governance activate-feature`) activates a planned roadmap
feature. `-F/--feature-id` is required; `-P/--parent-spec` is optional. When
the parent is supplied, AFOL validates that it is a unique, project-contained
`spec` bound to the same feature and still `planned` or `active`, then validates
all other inputs and targets before writing. Activation is fail-safe,
idempotent convergence: AFOL writes the parent spec first and the roadmap
feature second. It makes no multi-file atomicity promise. An interruption may
leave the parent `active` while the feature is still `planned` and therefore
not governable; retrying the same command completes the transition. If AFOL
observes a write error it attempts restoration, but crash safety is provided by
the write order, not by guaranteed rollback. `active` is an idempotent no-op
and `final` cannot be reopened. Governance resolution accepts the nested
`.afol/adm/roadmap/GENERAL-ROADMAP.md` layout and falls back to the flat
`.afol/adm/roadmap.md` layout when the nested file is absent. The selected
roadmap and its containing path components must not be symlinks, junctions, or
other reparse points.

Bulk waive is optional cemetery cleanup only. Shipping one feature never
requires bulk-waiving historical pending entries.

## Rule Injection

- `afol ctx bundle --persist-rule-injection` is the only context command that
  can persist first-use rule injection state for an identity. Plain
  `afol ctx bundle` is read-only.
- Identity dimensions are `session`, `task`, `role`, `surface`, and optional
  `file`; missing session/task collapse to `none`, and the file dimension is
  omitted when no file is present.
- `afol ctx explain`, `afol ctx tools`, and plain `afol ctx bundle` resolve
  context without consuming first-use injection state.
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
bun run manifest:check
bun run validate:project-benchmarks
bun run validate:release
```

For multi-task lifecycle throughput:

```bash
bun run benchmark:multitask
bun run benchmark:multitask:smoke
bun run benchmark:multitask --save
bun run benchmark:multitask:json
```

The default command runs 12 paired sequential/batch samples and fails when the
versioned baseline gates regress. It compares AFOL calls, verification runs,
authored hot-path characters, forced output bytes, p50/p95 latency, and the
100-task boundary. `:smoke` is a one-run functional check and never makes a
quality claim. `--save` writes the full JSON result under
`.afol/data/benchmarks/results/`; temporary fixtures are removed unless
`--keep-fixture` is explicitly requested.

Release evidence is scoped to the observed Linux x64 path. The CI release
runner is Ubuntu 24.04 x64; that evidence must not be generalized to Windows,
macOS, or ARM. Run `bun run smoke:wsl2` separately from an observed Linux x64
WSL2 shell when recording WSL2 evidence. The standalone build disables Bun
`.env` and `bunfig.toml` autoloading.

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
