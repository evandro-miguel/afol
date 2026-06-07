---
description: Core install, bootstrap, and upgrade flows for the agentic folder system
metadata:
  tags: "agentic-folder-sys, bootstrap, install, upgrade, scaffold"
---

# Agentic Folder Sys Core Workflow

Use this reference when the task is to install or upgrade the scaffold in
another repository.

## Governed Delivery Reminder

If you opened this reference while delivering a governed implementation,
validation, or fix in the current repository, do not bootstrap or inspect
scaffold internals first. Use the already-installed scaffold wrapper and keep
the order of state changes clear:

1. create or target the `docs/plans/` session,
2. move the execution task to in progress,
3. edit the product,
4. run the named acceptance check,
5. record task-scoped evidence and complete the task.

Treat named acceptance checks and validation scripts as the contract for the
task. Do not edit them to make the check pass unless the user explicitly asked
to change the validator itself.

## 1. Brand-New Repository Adoption

Full bootstrap can create the target directory when it does not exist yet.

```bash
mkdir -p /path/to/new-project
git -C /path/to/new-project init  # optional but recommended
./.agents/agents bootstrap /path/to/new-project
```

What this does:

- installs the `.agents` runtime surface writes the generic governance baseline
  keeps project-owned repository mapping under `docs/map/` seeds
  `.agents/source/universal-skills` inside the target repo runs the
  post-bootstrap checks unless `--skip-checks` is used

## 2. Existing Repository Adoption

For a live project, use partial mode so project-owned files are preserved.

```bash
./.agents/agents bootstrap /path/to/existing-project --partial
```

Important notes:

- `--partial` is the safe default for repos with live content. If the target
  repo already owns `make all`, use `make agents-all` for the scaffold aggregate
  validation. Use `--force` only when the overwrite is intentional.

## 3. Verified Scaffold Update

Use `scaffold-update` when the repo already has the scaffold and you need to
refresh scaffold-owned `.agents` files from a source checkout that already has
stable channel metadata, release artifacts, and a verifiable signed tag.

Preview first:

```bash
./.agents/agents scaffold-update --channel stable \
  --source /path/to/scaffold-source --plan-only
./.agents/agents scaffold-update --channel stable \
  --source /path/to/scaffold-source --diff-only
```

Apply only after the preview is expected:

```bash
./.agents/agents scaffold-update --channel stable \
  --source /path/to/scaffold-source \
  --apply \
  --validate-command "make agents-all"
```

Rules:

- do not use a floating branch as a stable source unless release metadata and
  signed-tag verification pass; do not apply from a source without
  `releases/channels/stable.json`; inspect the plan/diff before `--apply`; rely
  on the command backup under `.agents/tmp/scaffold-update/backups/<timestamp>/`
  for rollback evidence.

If the source checkout does not yet have stable channel metadata, use the
partial bootstrap flow below instead of pretending the update is verified.

## 4. Legacy Partial Bootstrap Upgrade

```bash
./.agents/agents bootstrap /path/to/adopted-project --partial
./.agents/agents skills-sync update --runtime codex
make -C /path/to/adopted-project agents-all
```

Use this flow when the repo already contains the scaffold and you want to
refresh the local framework surface without the stable channel updater.

## 5. Minimal Validation

After bootstrap or upgrade, validate with:

```bash
make doctor
make lint
make test-scripts
make agents-all
```

For isolated wrapper verification:

```bash
PATH=/usr/bin:/bin ./.agents/agents doctor
```
