---
doc_type: standard
id: repo-map-standard
status: active
created_at: '2026-03-23T00:00:00Z'
updated_at: '2026-04-13T19:37:01-03:00'
---

# Repo Map Standard

## Purpose

Define the full current-state repository mapping workflow for `docs/map/`.

Use this standard when the project needs more than a lightweight file inventory. The goal is to maintain a solid, reproducible codemap that other operators and agents can trust for repository-wide understanding.

## Relationship to Other Surfaces

- Project-owned documentation belongs under `docs/` at the repository root.
- `docs/map/` is the current-state, descriptive evidence surface.
- `docs/map/structure/` is the lightweight physical layout view.
- `docs/arc/README.md`, `PROJECT-BRIEF.md`, `ARCHITECTURE.md`, `TECH-STACK.md`, `GENERAL-ROADMAP.md`, `SPECS/`, and `DECISIONS/` remain the goal-state canon.
- Workbench artifacts remain the execution surface.
- `.agents/` remains the agent-system surface for workbench, runtime rules,
  skills, telemetry, and other operational state.

Do not treat `repo-map` output as roadmap, spec, or approval authority.

## Command

Primary wrapper:

```bash
./.agents/agents repo-map .
```

Just target:

```bash
just repo-map
```

Useful variants:

```bash
./.agents/agents repo-map . --dry-run
./.agents/agents repo-map . --output docs/map
./.agents/agents repo-map . --runner /path/to/run-repo-map.sh
```

Prefer the scaffold wrapper over calling `repo-analysis` repo-map tooling
directly. The wrapper enforces the project contract and keeps generated output in
`docs/map/`. Raw repo-analysis defaults may still target legacy locations when
used without an explicit output root.

## External Dependency

The scaffold command delegates the heavy analysis work to the external runner:

- preferred runner: `~/apps/docker-analisys-tools/scripts/run-repo-map.sh`
- configurable via:
  - `--runner`
  - `AGENTS_REPO_MAP_RUNNER`
  - `repo_map.runner_path` in `.agents/agents.config`

The scaffold does not install the toolbox automatically and must not try to install host-global tools on its own.

The standard `run-repo-map.sh` runner also expects these host tools to be available before execution:

- `ctags` in `PATH` (Universal Ctags compatible CLI)
- `docker` in `PATH`

Before invoking the runner, the scaffold prepares a temporary shadow copy of the repository for analysis. That shadow excludes non-canonical or derived surfaces such as `.git/`, `.agents/cache/`, `.agents/.cache/`, `.agents/wb/`, `.agents/z-arq/`, `.agents/tmp/`, previously generated `docs/map/`, legacy `docs/map/`, and `docs/map/structure/` output.

## Output Contract

The canonical output root is:

```text
docs/map/
```

Expected root docs include:

- `README.md`
- `CHANGELOG.md`
- `ARCHITECTURE.md`
- `FEATURES.md`
- `BACKEND.md`
- `FRONTEND.md`
- `API_MAP.md`
- `CONNECTIONS.md`
- `DEPENDENCY_GRAPH.md`
- `HOTSPOTS.md`
- `SYMBOLS.md`

Raw and machine-readable evidence belongs under:

```text
docs/map/extra/
```

Common subfolders:

- `extra/bootstrap/`
- `extra/phase1/`
- `extra/phase2/`
- `extra/phase3/`
- `extra/phase4/`
- `extra/phase5/`
- `extra/changelogs/`
- `extra/logs/`

## When to Refresh

Run `repo-map` when:

- large file moves or folder reorganization landed
- new domains or product surfaces were introduced
- backend/frontend boundaries changed materially
- dependency topology likely changed
- previous map artifacts are stale relative to the current repo

Prefer `structure-map` when you only need a quick physical file inventory.

## Validation

After a `repo-map` refresh:

```bash
just doctor
just lint
```

`just lint` validates the canonical `.agents` governance docs. The map surface under `docs/map/` is validated primarily by the `repo-map` command itself, while raw evidence under `docs/map/extra/` remains pipeline-owned output and should not be treated like hand-maintained governance docs.

The wrapper also rejects semantically degenerate output, not only missing files. At minimum, `README.md` must contain `Major Runtime Surfaces`, and the dependency graph must not collapse to markers like `Processed 0 files`.

If the work also changes the scripts or command surface:

```bash
just test-scripts
```

## Rules

- Do not manually write raw artifacts into `extra/`; let the analysis pipeline own them.
- Do not move goal-state decisions into `docs/map/`.
- Do not rely on grep-style inspection alone when the repository needs a full codemap refresh.
- Keep `docs/map/` refreshable and evidence-first.

---

*Standard: `docs/standards/repo-map.md`*
