---
description: Known traps for AFOL scaffold install, adoption, updates, skills, and workbench sessions
metadata:
  tags: "agentic-folder-sys, afol, gotchas, bootstrap, workbench, skills"
---

# Agentic Folder Sys Gotchas

## 1. AFOL Replaced The Old `.agents` Runtime

Do not run, document, restore, or extend:

- `.agents/agents`
- `.agents/scripts`
- `.agents/runtime`
- `.agents/wb` as active state
- `.agents/z-arq`
- `agents.config`
- `legacy:` command routing

Use `afol` commands only.

## 2. `.agents` Is Static Metadata, `.afol` Is Mutable State

Retained `.agents/**` content is static provider metadata:

- `.agents/config.json`
- `.agents/lock.json`
- `.agents/manifest.json`
- `.agents/rules/**`
- `.agents/source/**`

Mutable AFOL state belongs under `.afol/**`, including workbench sessions,
events, indexes, mutations, temporary files, benchmark data, migration
archives, and project-local skills.

## 3. Read `.agents/config.json` Before Moving Files

Do not guess paths. Read the path contract and follow fields such as
`paths.mutable_dir`, `paths.skills_dir`, `paths.wb_dir`, `paths.data_dir`, and
`paths.tmp_dir`.

## 4. `--partial` Is Stale

Current AFOL rejects partial installs. Use provider-compatible dry-runs instead:

```bash
afol init --provider-compatible --dry-run
afol bootstrap /path/to/project --provider-compatible --dry-run
```

## 5. Provider-Compatible Cleanup Preserves By Default

Legacy mutable roots under `.agents/**` are preserved unless both cleanup and
confirmation are passed:

```bash
afol init --provider-compatible --cleanup-provider-compatible-mutable \
  --confirm-provider-migration --dry-run
```

The confirmed migration archives old mutable roots under `.afol/data/migrations`
instead of treating them as active runtime state.

## 6. `--cleanup-obsolete` Is Not A General Delete Flag

Use it only for obsolete AFOL-known legacy scaffold paths reported by the
dry-run plan. Never delete unrelated project files, user data, vaults, caches,
or secrets during adoption cleanup.

## 7. `--force-managed` Is Narrow

`--force-managed` is for AFOL-managed files proven by the manifest. It is not a
project-wide overwrite switch.

## 8. Project-Local Skills Live Under `.afol/skills`

Do not copy caches or source mirrors into the project skill directory. Keep only
the curated skills agents should use in that project. Shared durable changes
belong in the universal-skills repo and then sync outward through the approved
flow.

## 9. Do Not Recreate Legacy Archive Paths

Do not archive new material under `.agents/z-arq`. Use AFOL migration archives,
AFOL file/archive commands when available, or a clearly reviewed project-owned
path.

## 10. Verify Before Closing

Do not mark work `[x]` just because files changed. Record evidence with
`afol evidence`, move to verified only after checks run, and close only after
closure evidence exists.

## 11. Keep AFOL Output Compact

AFOL is designed for low-token operation. Prefer compact/default command output.
Use verbose manifests only when resolving a concrete conflict.

## 12. Safety Rules Still Apply

Never expose secrets in code, logs, docs, or commits. Avoid destructive
operations unless explicitly authorized. Prefer dry-runs and archive migrations
over deletion during adoption.
