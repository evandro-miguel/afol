---
doc_type: standard
id: "repo-map-standard"
status: active
created_at: "2026-03-23T00:00:00Z"
updated_at: "2026-03-23T00:00:00Z"
---

# Repo Map Standard

## Purpose

Define the full current-state repository mapping workflow for `.agents/arc/map/`.

Use this standard when the project needs more than a lightweight file inventory. The goal is to maintain a solid, reproducible codemap that other operators and agents can trust for repository-wide understanding.

## Relationship to Other Surfaces

- `.agents/arc/map/` is the current-state, descriptive evidence surface.
- `.agents/arc/structure/` is the lightweight physical layout view.
- `.agents/arc/README.md`, `PROJECT-BRIEF.md`, `ARCHITECTURE.md`, `TECH-STACK.md`, `GENERAL-ROADMAP.md`, `SPECS/`, and `DECISIONS/` remain the goal-state canon.
- Workbench artifacts remain the execution surface.

Do not treat `repo-map` output as roadmap, spec, or approval authority.

## Command

Primary wrapper:

```bash
./.agents/agents repo-map .
```

Make target:

```bash
make repo-map
```

Useful variants:

```bash
./.agents/agents repo-map . --dry-run
./.agents/agents repo-map . --output .agents/arc/map
./.agents/agents repo-map . --runner /path/to/run-repo-map.sh
```

## External Dependency

The scaffold command delegates the heavy analysis work to the external runner:

- preferred runner: `~/apps/docker-analisys-tools/scripts/run-repo-map.sh`
- configurable via:
  - `--runner`
  - `AGENTS_REPO_MAP_RUNNER`
  - `repo_map.runner_path` in `.agents/agents.config`

The scaffold does not install the toolbox automatically and must not try to install host-global tools on its own.

## Output Contract

The canonical output root is:

```text
.agents/arc/map/
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
.agents/arc/map/extra/
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
make doctor
make lint
```

`make lint` validates the canonical docs in `arc/map/`, but raw evidence under `arc/map/extra/` is intentionally treated as pipeline-owned output and excluded from frontmatter enforcement.

If the work also changes the scripts or command surface:

```bash
make test-scripts
```

## Rules

- Do not manually write raw artifacts into `extra/`; let the analysis pipeline own them.
- Do not move goal-state decisions into `arc/map/`.
- Do not rely on grep-style inspection alone when the repository needs a full codemap refresh.
- Keep `arc/map/` refreshable and evidence-first.

---
*Standard: `.agents/a-docs/standards/repo-map.md`*
