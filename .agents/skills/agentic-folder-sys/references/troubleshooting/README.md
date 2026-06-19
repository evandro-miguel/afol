---
description: Validation and recovery guidance for AFOL install, update, workbench, and adoption drift
metadata:
  tags: "agentic-folder-sys, afol, troubleshooting, bootstrap, update, workbench"
---

# Agentic Folder Sys Troubleshooting

Use this reference when AFOL operations fail or when the repo state is unclear.
Start with live state and the smallest relevant command.

## 1. Install Plan Shows Conflicts

Symptom:

- dry-run exits non-zero or prints `conflict`.

Cause:

- an existing file differs from the scaffold-owned version, or the file is
  project-owned and must not be overwritten casually.

Fix:

```bash
afol init --provider-compatible --dry-run
```

Inspect the listed paths. Use `--force-managed` only for files proven to be
AFOL-managed. Do not use it as a blanket overwrite for project-owned files.

## 2. `--partial` Fails

Symptom:

- install reports that partial install is unsupported.

Cause:

- current AFOL no longer supports partial installs.

Fix:

- remove `--partial`;
- use `--provider-compatible --dry-run`;
- let the plan preserve project-owned files and show conflicts explicitly.

## 3. Legacy Mutable `.agents` Roots Were Preserved

Symptom:

- dry-run or apply reports `provider-compatible-cleanup-pending`.
- old `.agents/data`, `.agents/skills`, `.agents/tmp`, `.agents/wb`, or
  `.agents/z-arq` still exists, and the path is not the configured current
  path in `.agents/config.json`.

Cause:

- provider-compatible install preserves legacy mutable roots by default.

Fix:

```bash
afol init --provider-compatible --cleanup-provider-compatible-mutable \
  --confirm-provider-migration --dry-run
```

If the archive plan is correct, rerun without `--dry-run`. The migration
archives those roots into `.afol/data/migrations/**`; it does not treat them as
active runtime paths. Do not archive `.agents/skills` when it is the active
`paths.skills_dir`.

## 4. Obsolete Legacy Scaffold Files Were Preserved

Symptom:

- dry-run or apply reports `cleanup-pending` for files such as
  `.agents/scripts` or `.agents/runtime`.

Cause:

- obsolete cleanup is opt-in.

Fix:

```bash
afol init --provider-compatible --cleanup-obsolete --dry-run
```

Inspect the plan before applying. Do not delete unrelated project files.

## 5. Agent Writes Runtime State Under `.agents/wb`

Symptom:

- new session or evidence files appear under `.agents/wb`.

Cause:

- the agent followed stale legacy docs instead of the AFOL path contract.

Fix:

- read `.agents/config.json`;
- use `paths.wb_dir`, which should point at `.afol/wb`;
- move only deliberately reviewed runtime artifacts into AFOL-owned paths;
- update stale instructions that mention `.agents/wb` as active state.

## 6. Active Session Is Ambiguous

Symptom:

- evidence or done commands update the wrong session, or multiple agents race on
  active state.

Fix:

```bash
afol start --session <session-id> --task-id <task-id>
afol evidence --session <session-id> --task-id <task-id> \
  --command "<command>" --result passed
afol done --session <session-id> --task-id <task-id>
```

Pass explicit session and task ids during parallel work.

## 7. Minimal Recovery Checks

Run the smallest proof set first:

```bash
afol status
afol validate project
```

If generated indexes or local AFOL state look stale:

```bash
afol local-state rebuild --json
afol validate project --json
```

For source-repo scaffold changes, add:

```bash
bun run validate:bootstrap
bun run validate:template
```

Use broader release checks only when the change touches cross-cutting scaffold,
runtime, or release behavior.

## 8. `agents.config` Or Legacy Runtime Docs Found

Symptom:

- a target repo has `agents.config`, `legacy:` routing, `.agents/runtime`,
  `.agents/scripts`, or docs that tell agents to run `.agents/agents`.

Cause:

- stale pre-AFOL scaffold material.

Fix:

- do not restore or extend the legacy surface;
- migrate useful operational content into AFOL-owned docs or TypeScript AFOL
  implementation;
- keep `.agents/**` limited to static provider metadata;
- validate with `afol validate project`.
