---
description: Operational playbooks for AFOL skill updates, scaffold adoption, updates, and workbench execution
metadata:
  tags: "agentic-folder-sys, afol, bootstrap, update, workbench, skills"
---

# Agentic Folder Sys Patterns

Use these playbooks when an AFOL scaffold is installed or being adopted by an
existing project. AFOL is the only active runtime. Do not use the retired
`.agents` command system.

## 1. Install AFOL Into The Current Project

Inspect the repo first:

```bash
pwd
git status --short --branch
afol status
```

Dry-run the provider-compatible install:

```bash
afol init --provider-compatible --dry-run
```

Apply only after the plan is understood:

```bash
afol init --provider-compatible
afol validate project
```

Provider-compatible install keeps `.agents/**` as static provider metadata and
places mutable AFOL state under `.afol/**`.

## 2. Install AFOL Into Another Project

From the AFOL source checkout:

```bash
afol bootstrap /path/to/project --provider-compatible --dry-run
afol bootstrap /path/to/project --provider-compatible
afol validate project
```

Alias:

```bash
afol b /path/to/project --provider-compatible --dry-run
```

Do not use `--partial`; current AFOL rejects partial installs.

## 3. Handle Existing Operational Files During Adoption

Before applying, inventory the receiving project:

- project-owned guidance and docs such as `AGENTS.md`, `CLAUDE.md`, `RTK.md`,
  root `docs/**`, runbooks, and local operational files agents already use;
- current provider-facing metadata and skills under `.agents/config.json`,
  `.agents/lock.json`, `.agents/manifest.json`, and `.agents/skills/**`;
- current AFOL governance payloads under `.afol/adm/rules/**`,
  `.afol/adm/hooks/**`, `.afol/adm/source/**`, and `.afol/adm/tools.json`;
- current mutable AFOL state under `.afol/wb/**`,
  `.afol/data/**`, `.afol/tmp/**`, `.afol/adm/**`, and `.afol/pstr/**`;
- retired operational files such as `.agents/agents`, `.agents/scripts/**`,
  `.agents/runtime/**`, `.agents/wb`, `.agents/skills`, `.agents/tmp`,
  `.agents/data`, `.agents/z-arq`, and `agents.config`.

Read the dry-run output as an adoption plan:

- `create`: new AFOL/static scaffold file.
- `update-managed`: AFOL-managed file that can be rewritten.
- `preserve-project-owned`: project-owned file left untouched.
- `conflict`: existing file differs and needs review.
- `mutable-baseline-create`: missing `.afol/**` runtime baseline.
- `cleanup-pending`: obsolete legacy file preserved unless cleanup is enabled.
- `provider-compatible-cleanup-pending`: legacy mutable `.agents/**` root
  preserved unless archive migration is explicitly confirmed.

Use cleanup flags only after inspecting the listed paths:

```bash
afol init --provider-compatible --cleanup-obsolete --dry-run
afol init --provider-compatible --cleanup-provider-compatible-mutable \
  --confirm-provider-migration --dry-run
```

`--cleanup-obsolete` removes retired scaffold files such as `.agents/scripts`
and `.agents/runtime` when confirmed by the plan. Provider-compatible mutable
cleanup archives old `.agents/data`, `.agents/skills`, `.agents/tmp`,
`.agents/wb`, and `.agents/z-arq` into
`.afol/data/migrations/<stamp>_provider-compatible-mutable-migration`.

The final adoption note should distinguish: already present, created, updated,
preserved project-owned, legacy cleanup pending, and cleanup flags required.
Patch stale AFOL instructions in project-owned docs without erasing local
product context.

## 4. Update An Installed Scaffold

Use the compact update lane first:

```bash
afol update check
afol update preview
afol update apply --dry-run
```

Use verbose output only when a conflict requires the full file manifest. Apply
only after the target paths and conflicts are understood.

## 5. Maintain Project-Local Skills

Project-local AFOL skills live under `.agents/skills/**`.

When updating this skill for a project:

- edit the relevant `.agents/skills/<skill-name>/` files;
- keep the global copy under `~/.codex/skills/<skill-name>/` in sync only when
  the change is intended for all projects;
- do not copy caches, generated mirrors, or universal-skills source checkouts
  into `.agents/skills`;
- route durable shared skill changes through the universal-skills repo and its
  normal review path.

## 6. Governed Workbench Execution

Use a workbench session for non-trivial implementation, validation, benchmark,
or migration work:

```bash
afol new <theme> --feature-id F-10 --parent-spec <spec-id>
afol start --session <session-id> --task-id T-01
afol evidence --session <session-id> --task-id T-01 \
  --command "<verification command>" --result passed
afol done --session <session-id> --task-id T-01
afol close --session <session-id>
```

State lives in the configured `paths.wb_dir`, which defaults to `.afol/wb`.
Pass `--session` explicitly when multiple agents or terminals are active.

Task state belongs in the workbench State Board, not in parallel checkbox
rows:

- `pending`: planned.
- `in_progress`: active execution.
- `problem`: blocked.
- `moved`: deferred.
- `implemented_untested`: implementation complete, verification pending.
- `tested_needs_spec_validation`: verified, closure pending.
- `done`: closed.

Move to `tested_needs_spec_validation` only after evidence exists. Move to
`done` only after closure evidence exists.

## 7. Parallel Agent Handoff

When delegating AFOL work, include:

- goal and exact repo root;
- allowed files and forbidden legacy surfaces;
- current branch and dirty-state warning;
- relevant skill names;
- expected output contract;
- whether the agent may edit or is read-only;
- session id and task id when governed workbench state is active.

Tell helpers to read `.agents/config.json` for the path contract and to write
mutable runtime state only under `.afol/**`.
