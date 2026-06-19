---
doc_type: standard
id: 000000_000000_bootstrap-other-repo_standard_01
status: active
created_at: '2026-03-23T00:00:00Z'
updated_at: '2026-05-04T16:08:30-03:00'
---

# Bootstrap Other Repo

## Purpose

Define how to install the AFOL scaffold into another repository, including:

- full bootstrap for a fresh repo
- partial installation for an existing repo
- limitations and safe usage notes
- the skills baseline that should be prepared for future universal-skills contract evolution
- the preferred project-local skill model, where each repo carries its own `.agents/skills` subset instead of depending on many global Codex skills
- the export source boundary, where the reusable baseline lives under `src/project-template/` in this repo instead of the live development root
- the canonical operator front door `afol`; downstream installs must not depend
  on legacy aliases or legacy just command runners
- the static `.agents` metadata boundary and mutable `.afol` runtime boundary

## Public onboarding requirements

- Command path: `afol bootstrap` from the native Bun/TypeScript CLI.
- Repo path requirement:
  - provide a normal target directory path such as `/path/to/target-repo`,
    not a private host path.
- Mode:
  - `full`: target is empty or new.
  - `partial`: target already has live content and you want scaffold adoption only.
- Validation minimum:
  - `afol` confirms the front-door wrapper is present.
  - `afol s` (or `afol status`) confirms onboarding command visibility.
  - `afol b /path/to/existing-project --partial` confirms the partial install path.
  - `afol status`
  - `afol validate project`

## Modes

### Full Bootstrap

Use full bootstrap when the target repo is new or mostly empty.

What it does:

- creates the target directory when it does not exist yet
- installs the native AFOL baseline
- installs static `.agents` scaffold metadata
- prepares mutable `.afol` runtime state
- generates the generic governance baseline
- prepares desired-state administration under `.afol/adm/`
- prepares current-state map ownership under `.afol/pstr/`
- creates the workbench/local-state directories under `.afol/` without copying source-repo workbench history
- validates through the native front door after bootstrap
- prepares `.afol/adm/source/universal-skills` as the preferred repo-local upstream source checkout
- seeds that checkout from committed scaffold assets, so the default bootstrap path does not require a network clone

Recommended command:

```bash
afol bootstrap /path/to/target-repo
```

### Partial Installation

Use partial installation when the target repo already exists and has project content.

Behavior:

- existing files are preserved by default
- missing scaffold files and folders are added
- generated governance files are written only where the target does not already have a file
- the target receives the state-vs-goal split without adding a second planning tree
- `--force-managed` is required to overwrite managed scaffold conflicts
- the current skills manifest is treated as a compatibility baseline, not as a copy of scaffold-local history
- bootstrap copies from `src/project-template/`, so downstream output stays clean even if the development workspace contains extra local-only files
- the target repo should remain ready for repo/ref/profile-based skill installs when the upstream contract lands
- repo-local skills remain the primary contract; Codex global skills should stay lean

This is the safe path for adopting the scaffold into a live project without clobbering the project’s own source tree.

Recommended command:

```bash
afol bootstrap /path/to/existing-project --partial
```

## Update Contract

When bootstrap/adoption runs against an existing repository, the default
behavior is an overlay update, not a replacement update.

### Guaranteed Defaults

- preserve project-owned files by default
- add missing scaffold-managed files and directories
- skip existing files unless a managed patch is explicitly required
- keep target docs, skills, workbench, and local runtime choices intact unless
  the operator explicitly asks for a replacement
- prefer MCP/runtime planning and validation, with script wrappers as fallback

### Update Action Taxonomy

Bootstrap and the runtime update flow should classify each candidate path as
one of:

- `create` - file or folder is missing and can be added safely
- `skip` - target already owns the path and no managed change is required
- `patch-managed` - scaffold-owned file can be updated in place
- `adapt-config` - target config needs a compatibility translation, not a rewrite
- `add-wrapper` - a missing adapter file should be added for runtime or MCP
- `reconcile-skills` - skills manifest/source mismatch needs classification
- `conflict` - target-owned content differs and must be reviewed before overwrite
- `benchmark` - record timing, warnings, and validation evidence for the update
- `rollback-record` - capture undo metadata for any mutating batch

### Conflict Rule

If a target file is project-owned and the scaffold wants to change it, the
default outcome is `conflict`, not overwrite. The operator must opt into a
reviewed replacement path before the file can be changed.

### Idempotence Rule

Running the same update twice must not create new diffs after the first safe
apply. Repeated runs may emit `skip` or `benchmark` results, but they must not
silently replace additional project content.

## Safe Usage

- Use `--dry-run` before applying changes to a production repo.
- Use `--force-managed` only when you intentionally want to replace managed scaffold files.

## Limitations

- Bootstrap does not infer the project’s own roadmap or specs.
- Bootstrap does not generate current-state repository maps; it only provisions the place and rules for them.
- Bootstrap does not copy source-repo workbench sessions, active-session pointers, or source-repo current-state map artifacts into the target repo.
- Existing project governance should be reviewed after install before non-trivial work begins.
- If the target repo already has its own `AGENTS.md` or runtime adapter files, review the merge outcome before accepting the install.
- Optional upstream skills sync may emit warnings; those warnings are non-blocking.
- Bootstrap does not copy scaffold-local skill history; it only prepares the baseline needed for the target repo to own its selection and upgrade path.
- Bootstrap should reinforce project-local skills, not turn global Codex skills into a second project contract.
- `skills-sync pull` refreshes only a configured external git-backed source; use `skills-sync sync` / `skills-sync update` to actually refresh `.agents/skills/` in the target repo.
- Python/uv bootstrap scripts are factory-only compatibility surfaces. Public
  downstream installs should use the native `afol bootstrap` path and should
  not require `.agents/scripts`, `.agents/runtime`, or project-local uv
  virtualenvs.

## Verification

After install, validate the target repo with:

```bash
afol status
afol validate project
```

For isolated environments, point `AGENTIC_CLI_PATH` at the source checkout's
native CLI and confirm the exported front door works:

```bash
AGENTIC_CLI_PATH=/path/to/source/cli/main.ts afol validate project
```

---

*Standard: `docs/standards/bootstrap-other-repo.md`*
