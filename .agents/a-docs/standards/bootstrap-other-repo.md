---
doc_type: standard
id: 000000_000000_bootstrap-other-repo_standard_01
status: active
created_at: '2026-03-23T00:00:00Z'
updated_at: '2026-03-23T19:07:53-03:00'
---

# Bootstrap Other Repo

## Purpose

Define how to install the `.agents` scaffold into another repository, including:
- full bootstrap for a fresh repo
- partial installation for an existing repo
- limitations and safe usage notes
- the skills baseline that should be prepared for future universal-skills contract evolution
- the preferred project-local skill model, where each repo carries its own `.agents/skills` subset instead of depending on many global Codex skills

## Modes

### Full Bootstrap

Use full bootstrap when the target repo is new or mostly empty.

What it does:
- installs the `.agents` runtime surface
- generates the generic governance baseline
- prepares the goal-state canon under `.agents/arc/` and the optional current-state map surface under `.agents/arc/map/`
- creates the workbench and runtime directories
- runs post-bootstrap validation unless `--skip-checks` is used
- if the target lives under `.../apps/<repo>`, prepares `.../apps/universal-skills` as the sibling upstream source checkout

Recommended command:

```bash
./.agents/agents bootstrap /path/to/target-repo
```

### Partial Installation

Use partial installation when the target repo already exists and has project content.

Behavior:
- existing files are preserved by default
- missing `.agents` files and folders are added
- generated governance files are written only where the target does not already have a file
- the target receives the state-vs-goal split without adding a second planning tree
- `--force` is required to overwrite existing files
- if the target repo already owns `make all`, the scaffold preserves that target and exposes the aggregate scaffold validation as `make agents-all`
- the current skills manifest is treated as a compatibility baseline, not as a copy of scaffold-local history
- the target repo should remain ready for repo/ref/profile-based skill installs when the upstream contract lands
- repo-local skills remain the primary contract; Codex global skills should stay lean

This is the safe path for adopting the scaffold into a live project without clobbering the project’s own source tree.

Recommended command:

```bash
./.agents/agents bootstrap /path/to/existing-project --partial
```

## Safe Usage

- Use `--dry-run` before applying changes to a production repo.
- Use `--skip-checks` only when you need the install step but will validate separately.
- Use `--force` only when you intentionally want to replace existing files.

## Limitations

- Bootstrap does not infer the project’s own roadmap or specs.
- Bootstrap does not generate current-state repository maps; it only provisions the place and rules for them.
- Existing project governance should be reviewed after install before non-trivial work begins.
- If the target repo already has its own `AGENTS.md`, `Makefile`, or runtime adapter files, review the merge outcome before accepting the install.
- Optional upstream skills sync may emit warnings; those warnings are non-blocking.
- Bootstrap does not copy scaffold-local skill history; it only prepares the baseline needed for the target repo to own its selection and upgrade path.
- Bootstrap should reinforce project-local skills, not turn global Codex skills into a second project contract.

## Verification

After install, validate the target repo with:

```bash
make doctor
make lint
make test-scripts
make agents-all
```

For isolated environments, also confirm the wrapper works without `uv` on `PATH`:

```bash
PATH=/usr/bin:/bin ./.agents/agents doctor
```

---
*Standard: `.agents/a-docs/standards/bootstrap-other-repo.md`*
