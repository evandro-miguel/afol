---
doc_type: remediation_plan
id: "260811_1532_non_blocking_issues_remediation_plan_01"
session_id: "260811_1532_real-tools-followups"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
status: "ready_for_execution"
---

# Non-blocking issues remediation plan

## Objective and boundaries

Close the six observed non-blocking AFOL CLI defects without restoring legacy
`.agents` flows, weakening CI/session fail-closed behavior, or exposing child
process output. This plan changes CLI implementation and tests only; it does
not alter either workbench lifecycle, run a global install, or commit/push.

Facts: the F-29 session is governed and has I-002 through I-006 as pending
tasks; I-008 is owned by the separate governed session
[`260811_1534_real-tools-evidence-followup`](../../260811_1534_real-tools-evidence-followup/260811_1534_real-tools-evidence-followup_plan_01.md).
`cli/commands/context.ts` currently passes only an explicit `--session` to
`buildContextBundle`; the CI-aware public `resolveSession` wrapper is owned by
`cli/commands/workbench/verify.ts` (with `session-context.ts` lower-level);
`adr` and `changelog` are registry `read` actions; and
`evolve analyze` emits a generic blocked recovery action.

Assumption to prove in each focused test: the existing command/test modules are
the intended public-contract surfaces; no downstream scaffold-owned
`.gitignore` file currently provides the needed managed merge behavior.

## Waves and ownership

Wave 1 may run in parallel because each slice has exclusive implementation and
test ownership. Re-read shared registry/template files immediately before any
patch; do not overwrite concurrent changes.

| Slice | Owner | Allowed files | Acceptance test |
| --- | --- | --- | --- |
| I-002 JSON init preview | `build` — CLI | `cli/commands/bootstrap.ts`, `cli/tests/bootstrap.test.ts`, `cli/tests/kernel.test.ts`, `cli/tests/help.test.ts` only if help contract changes | `bun test cli/tests/bootstrap.test.ts cli/tests/kernel.test.ts cli/tests/help.test.ts` proves public `init --dry-run --json` routing returns one stable `afol.result/v1` preview/error envelope, with no target write. |
| I-003 registry action parity | `build` — registry | `cli/registry.ts`, `cli/tests/registry.test.ts`, `cli/validate/registry.ts` only if canonical parity needs it | `bun test cli/tests/registry.test.ts` proves `adr`/`changelog` metadata agrees with their actual side effect and every registry parity invariant still holds. |
| I-004 evolve diagnostic | `build` — evolution | `cli/commands/evolve.ts`, `cli/services/evolution/analysis.ts`, `cli/tests/evolve-command.test.ts` | `bun test cli/tests/evolve-command.test.ts` proves an analysis blocked by state diagnostics points to `afol evolve status` and preserves the sanitized public JSON contract. |
| I-005 active context session | `build` — context | `cli/commands/context.ts`, `cli/commands/workbench/verify.ts`, `cli/services/context/bundler.ts`, `cli/tests/context-system.test.ts`, `cli/tests/session-command.test.ts` | `bun test cli/tests/context-system.test.ts cli/tests/session-command.test.ts` proves the public ctx route resolves an omitted session through the CI-aware `resolveSession` owner, retains explicit-session precedence, has no CI global fallback, and fails closed for corrupt bindings. |

Wave 2 begins only after I-002 is green because both I-002 and I-006 own
`cli/commands/bootstrap.ts` and `cli/tests/bootstrap.test.ts`. I-003's
registry assertions may complete independently; its result is required before
integrating the final registry/template inventory check.

| Slice | Owner | Allowed files | Acceptance test |
| --- | --- | --- | --- |
| I-006 managed lock ignore | `build` — scaffold/update | `cli/commands/bootstrap.ts`, `cli/services/bootstrap/planner.ts`, `cli/commands/update.ts`, `cli/services/update/check.ts`, `cli/tests/bootstrap.test.ts`, `cli/tests/bootstrap-template-cleanliness.test.ts`, `cli/tests/template-policy.test.ts`, `cli/tests/update-command.test.ts` | `bun test cli/tests/bootstrap.test.ts cli/tests/bootstrap-template-cleanliness.test.ts cli/tests/template-policy.test.ts cli/tests/update-command.test.ts` proves the named policy merge adds exactly one `.afol/wb/.locks/` rule to a project-owned/unmanaged `.gitignore`, preserves user lines/order and final-newline semantics, repeats idempotently, and `init --dry-run` reports the pending merge without writing it. It also proves update check/preview expose the named operation, dry-run preserves bytes, approved apply appends once, its rollback journal restores the prior file, and symlink/non-regular conflicts fail closed. |

Wave 3 is gated by an explicit reproduction matrix in the linked I-008 session;
the executor records only case name, exit class, stable diagnostic code, and
redacted/bounded display text before changing the contract.

| Slice | Owner | Allowed files | Acceptance test |
| --- | --- | --- | --- |
| I-008 bounded child-failure diagnostics | `build` — evidence UX | `cli/commands/workbench/args.ts`, `cli/commands/workbench.ts`, `cli/commands/workbench/verify.ts`, `cli/services/workbench/completion-lock.ts`, `cli/tests/workbench-lifecycle.test.ts`, and `cli/tests/completion-lock.test.ts` | `bun test cli/tests/workbench-lifecycle.test.ts cli/tests/completion-lock.test.ts` proves distinct, sanitized and byte-capped diagnostics for (1) invalid command/parser input, (2) a child non-zero exit, and (3) a same-task nested `done` lock; raw child stdout/stderr is never persisted or reflected. |

## Execution details

1. I-002: add JSON parsing/output to the dry-run path rather than a second init
   implementation. Preserve compact text output and dry-run's zero-write
   guarantee; test success, validation error, and target non-mutation.
2. I-003: correct only the canonical registry metadata (and validator if its
   contract requires it). Do not change command behavior merely to satisfy a
   label; add direct parity assertions for both actions.
3. I-004: carry the state-health blocking reason through the bounded public
   diagnostic mapper and make recovery `afol evolve status` before any repair
   command. Keep raw findings/private paths out of JSON and text output.
4. I-005: resolve an absent context-bundle session in the public ctx route
   through the CI-aware public `resolveSession(projectRoot, ...)` wrapper in
   `cli/commands/workbench/verify.ts`, before `buildContextBundle`; use its
   source/CI policy instead of duplicating active-pointer logic. Explicit
   `--session` retains precedence.
5. I-006: implement one named policy merge in bootstrap/update planning/apply,
   not a template overwrite. `.gitignore` remains project-owned/unmanaged;
   merge only when its resolved path stays inside the target root, it is a
   regular file (or absent), and the canonical rule is absent. Preserve user
   bytes except the required newline separator and appended rule. An existing
   rule is a no-op; a symlink, non-regular file, unsafe path, or ownership
   conflict fails closed with no write. Update check and preview expose this
   named policy operation; dry-run changes no bytes; approved apply appends the
   rule once and records a rollback journal that restores the prior
   `.gitignore`. Test absent, regular files with and without final newline,
   existing and duplicate rules, and symlink/non-regular conflicts.
6. I-008: reproduce all three matrix rows before patching. Add typed public
   classification at the `done -x` boundary, preserve completion-lock fencing,
   return only a sanitized byte-capped diagnostic (never raw child output),
   and keep nested same-task completion rejected rather than retrying it.

## Risks, rollback, and integration

- JSON schema drift: snapshot only stable envelope fields. Roll back the
  affected slice by reverting its isolated change; do not alter callers.
- Active-session ambiguity: use the shared CI-aware resolver and retain
  explicit-precedence plus CI fail-closed tests; rollback removes only the new
  implicit-resolution branch.
- `.gitignore` data loss or path escape: never rewrite user content or
  normalize the whole file. The named policy merge accepts only an absent or
  in-root regular path that needs an append; symlink, non-regular, unsafe, or
  ownership-conflict cases return a conflict and make no write. Apply writes a
  rollback journal before mutation and restores the exact prior bytes on
  rollback.
- Diagnostics leaking output/secrets: test redaction plus a strict byte cap;
  retain the existing assertions that raw child output is neither persisted nor
  reflected.
- Parallel overlap: Wave 1 write scopes are disjoint. I-006 is serialized
  after I-002 because both touch bootstrap files; I-008 waits for its matrix.
  Integrate each slice only after its focused suite passes and re-run
  overlapping focused suites after conflict resolution.

## Final validation and delivery

After all focused tests pass, execute from the exact integrated tree:

```bash
bun run manifest:check
bun run typecheck
bun test
bun run validate:release
```

Then inspect `git diff --check` and the changed-file allowlist. If any gate
fails, keep the affected slice open; do not mark either workbench task done
from this plan. The final report must distinguish I-002–I-006 from I-008's
linked session and record commands, exact changed paths, and residual risks.
