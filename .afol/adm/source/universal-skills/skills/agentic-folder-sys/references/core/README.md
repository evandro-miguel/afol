---
description: Core AFOL install, adoption, update, and validation flows
metadata:
  tags: "agentic-folder-sys, afol, bootstrap, init, provider-compatible, install, upgrade, scaffold"
---

# Agentic Folder Sys Core Workflow

Use this reference when installing or updating AFOL in a repository.

## Governed Delivery Reminder

If you opened this reference while delivering a governed implementation,
validation, or fix in an already adopted repo, do not bootstrap first. Use the
installed AFOL front door:

1. create or target the configured `.afol/wb/` session,
2. move the execution task to in progress,
3. edit the product,
4. run the named acceptance check,
5. record task-scoped evidence and complete the task.

## 1. In-Place Adoption

Use `afol init` inside the target repo. It defaults to the current directory.

Preview:

```bash
afol init --provider-compatible --dry-run
```

Apply:

```bash
afol init --provider-compatible
```

Use `--without-claude` when the receiving repo should not get Claude adapter
files. Use `--mutable-dir <dir>` only when the target repo has a deliberate
non-default mutable path contract.

## 2. Adoption From Another Checkout

Use `afol bootstrap` or its `b` alias when operating on an explicit target path.

Preview:

```bash
afol b /path/to/project --provider-compatible --dry-run
```

Apply:

```bash
afol b /path/to/project --provider-compatible
```

`--partial` is not supported by current AFOL. For live repositories, safety
comes from dry-run, manifest ownership, conflict detection, and
provider-compatible mutable paths, not from partial mode.

## 3. Reading The Bootstrap Plan

Important output classes:

- `create`: scaffold file will be created.
- `update-managed`: scaffold-owned file can be updated.
- `preserve-project-owned`: target owns the file; AFOL will not overwrite it.
- `conflict`: local drift or unknown ownership; inspect before applying
  `--force-managed`.
- `cleanup-pending`: retired Python scaffold artifacts were detected.
- `provider-compatible-cleanup-pending`: legacy mutable roots under `.agents/`
  were detected.
- `mutable-baseline-create`: AFOL will seed missing `.afol/**` baseline files.
- `mutable-baseline-skip-existing`: AFOL will preserve existing `.afol/**`
  mutable baseline files.

Apply `--force-managed` only for confirmed scaffold-owned conflicts. Do not use
it to overwrite project-owned docs, app code, secrets, or user data.

## 4. Inventory And Update Decisions

Before applying a receiving-project update, produce a compact inventory:

- project-owned guidance and docs: `AGENTS.md`, `CLAUDE.md`, `RTK.md`,
  root `docs/**`, project runbooks, and local operational files agents already
  use
- present provider-facing scaffold metadata and skills: `.agents/config.json`,
  `.agents/lock.json`, `.agents/manifest.json`, `.agents/skills/**`
- present AFOL governance payloads: `.afol/adm/rules/**`,
  `.afol/adm/hooks/**`, `.afol/adm/source/**`, `.afol/adm/tools.json`
- present mutable AFOL state: `.afol/wb/**`,
  `.afol/data/**`, `.afol/tmp/**`, `.afol/adm/**`, `.afol/pstr/**`
- retired Python/runtime files: `.agents/agents`, `.agents/agents-mcp`,
  `.agents/scripts/**`, `.agents/runtime/**`, old Python metadata/cache files
- legacy mutable roots: `.agents/data`, `.agents/skills`, `.agents/tmp`,
  `.agents/wb`, `.agents/z-arq`
- retired config fallback: `agents.config`

Use this classification:

- `create`: safe scaffold creation.
- `update-managed`: safe scaffold update unless the dry-run reports a conflict.
- `preserve-project-owned`: do not overwrite; migrate only the useful intent.
- `conflict`: inspect diff and ownership before `--force-managed`.
- `cleanup-pending`: cleanup only with `--cleanup-obsolete`.
- `provider-compatible-cleanup-pending`: archive only with
  `--cleanup-provider-compatible-mutable` and
  `--confirm-provider-migration`.
- `mutable-baseline-skip-existing`: preserve existing `.afol/**` mutable files.

The agent handoff/report should explicitly name what exists, what needs an
AFOL-managed update, what stays preserved, what is legacy cleanup, and what flag
would be required to perform that cleanup.

Project guidance and docs are not scaffold defaults to be reset. Keep local
product facts, stack commands, architecture notes, and runbooks; patch only the
stale AFOL operational parts.

## 5. Legacy Cleanup During Adoption

Retired Python/runtime artifacts:

```bash
afol b /path/to/project --provider-compatible --dry-run --cleanup-obsolete
afol b /path/to/project --provider-compatible --cleanup-obsolete
```

This targets obsolete scaffold files such as `.agents/agents`,
`.agents/agents-mcp`, `.agents/scripts/**`, `.agents/runtime/**`, and Python
metadata/cache files from the old scaffold.

Legacy mutable roots under `.agents/`:

```bash
afol b /path/to/project --provider-compatible \
  --cleanup-provider-compatible-mutable \
  --confirm-provider-migration
```

This archives `.agents/data`, `.agents/skills`, `.agents/tmp`, `.agents/wb`,
and `.agents/z-arq` under
`.afol/data/migrations/<timestamp>_provider-compatible-mutable-migration/`.
Without both flags, AFOL preserves these paths.

Inspect before cleanup. If a legacy file contains useful project-owned content,
convert it into `AGENTS.md`, `.afol/adm/**`, `.agents/skills/**`, or project docs
instead of deleting it.

## 6. Path Contract After Install

After install, read:

```bash
cat .agents/config.json
```

Use `paths.mutable_dir`, `paths.wb_dir`, `paths.skills_dir`, `paths.tmp_dir`,
`paths.data_dir`, and `paths.events_file` for all AFOL-owned writes.

Default provider-compatible layout:

- provider-facing metadata and skills: `.agents/config.json`,
  `.agents/lock.json`, `.agents/manifest.json`, `.agents/skills/**`
- AFOL governance payloads: `.afol/adm/rules/**`, `.afol/adm/hooks/**`,
  `.afol/adm/source/**`, `.afol/adm/tools.json`
- mutable state: `.afol/wb/**`, `.afol/data/**`,
  `.afol/tmp/**`, `.afol/adm/**`, `.afol/pstr/**`

## 7. Minimal Validation

For a receiving repo:

```bash
afol s
afol validate project
```

For AFOL source repo scaffold/template changes:

```bash
bun run validate:bootstrap
bun run validate:template
```

For AFOL source repo release readiness:

```bash
afol local-state rebuild --json
afol validate project --json
bun run typecheck
bun test
bun run validate:release
```
