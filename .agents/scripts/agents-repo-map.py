#!/usr/bin/env python3
"""Generate or refresh the full repository codemap under `docs/map/`."""

from __future__ import annotations

import argparse
import os
import shutil
import tempfile
from pathlib import Path
from typing import Iterable, List

from lib.agents_config import load_agents_config
from lib.process_utils import run_command


ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
MAP_CFG = CONFIG.get("repo_map", {})
PATHS_CFG = CONFIG.get("paths", {})
DEFAULT_OUTPUT_DIR = str(PATHS_CFG.get("map_dir", "docs/map")).strip() or "docs/map"
DEFAULT_IMAGE = str(MAP_CFG.get("docker_image", "docker-analisys-tools:latest")).strip() or "docker-analisys-tools:latest"
DEFAULT_REQUIRED_DOCS = [str(item) for item in MAP_CFG.get("required_root_docs", ["README.md"]) if str(item).strip()]
DEFAULT_RUNNER_HINT = Path.home() / "apps" / "docker-analisys-tools" / "scripts" / "run-repo-map.sh"
SCAFFOLD_CONTRACT_HEADING = "## Scaffold Contract"
SCAFFOLD_CONTRACT_BLOCK = "\n".join(
    [
        SCAFFOLD_CONTRACT_HEADING,
        "",
        "- `docs/map/` is the current-state, descriptive evidence surface for repository mapping.",
        "- Goal-state canon stays outside this folder in `docs/arc/`, roadmap, specs, ADRs, and related architecture docs.",
        "- Use this map for refreshable observation and analysis, not as approval authority for desired-state decisions.",
        "",
    ]
)
ANALYSIS_EXCLUDES = {
    ".git",
    ".coverage",
    ".pytest_cache",
    "__pycache__",
    ".mypy_cache",
    ".ruff_cache",
    ".venv",
    ".agents/.cache",
    ".agents/cache",
    ".agents/wb",
    ".agents/z-arq",
    ".agents/tmp",
    "docs/map",
    "docs/map/structure",
}
DEGENERATE_MARKERS = {
    "DEPENDENCY_GRAPH.md": ["Processed 0 files"],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate or refresh the repository codemap under docs/map")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root to analyze (default: current directory)")
    parser.add_argument("--output", help="Map output directory (default: <repo>/docs/map)")
    parser.add_argument("--runner", help="Path to run-repo-map.sh")
    parser.add_argument("--image", default=DEFAULT_IMAGE, help=f"Docker image tag (default: {DEFAULT_IMAGE})")
    parser.add_argument("--dry-run", action="store_true", help="Print the resolved command without executing it")
    return parser.parse_args()


def _resolve_repo(path_arg: str) -> Path:
    candidate = Path(path_arg).expanduser().resolve()
    if not candidate.exists() or not candidate.is_dir():
        raise FileNotFoundError(f"Repository path not found: {path_arg}")
    return candidate


def _resolve_output(repo_root: Path, output_arg: str | None) -> Path:
    if output_arg:
        output = Path(output_arg).expanduser()
        if not output.is_absolute():
            output = (repo_root / output).resolve()
        else:
            output = output.resolve()
        return output
    return (repo_root / DEFAULT_OUTPUT_DIR).resolve()


def _runner_candidates(cli_runner: str | None) -> Iterable[Path]:
    if cli_runner:
        yield Path(cli_runner).expanduser()

    env_runner = os.environ.get("AGENTS_REPO_MAP_RUNNER", "").strip()
    if env_runner:
        yield Path(env_runner).expanduser()

    cfg_runner = str(MAP_CFG.get("runner_path", "")).strip()
    if cfg_runner:
        yield Path(cfg_runner).expanduser()

    yield DEFAULT_RUNNER_HINT


def _resolve_runner(cli_runner: str | None) -> Path:
    tried: List[str] = []
    for candidate in _runner_candidates(cli_runner):
        resolved = candidate.resolve() if candidate.exists() else candidate
        tried.append(str(resolved))
        if resolved.exists() and resolved.is_file():
            return resolved
    tried_block = "\n".join(f"- {item}" for item in tried)
    raise FileNotFoundError(
        "Repository map runner not found. Set one of:\n"
        "- --runner /path/to/run-repo-map.sh\n"
        "- AGENTS_REPO_MAP_RUNNER=/path/to/run-repo-map.sh\n"
        "- repo_map.runner_path in .agents/agents.config\n"
        f"Tried:\n{tried_block}"
    )


def _validate_generated_docs(output_root: Path, required_docs: list[str]) -> list[Path]:
    generated = sorted(path for path in output_root.glob("*.md") if path.is_file())
    missing = [doc for doc in required_docs if not (output_root / doc).exists()]
    if missing:
        missing_block = ", ".join(missing)
        raise RuntimeError(f"Repo map run completed but required map docs are missing: {missing_block}")
    return generated


def _extract_section_body(path: Path, heading: str) -> str:
    if not path.exists():
        return ""

    capture = False
    body: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() == heading:
            capture = True
            continue
        if capture and line.startswith("## "):
            break
        if capture:
            body.append(line)
    return "\n".join(body).strip()


def _replace_section(path: Path, heading: str, new_body_lines: list[str]) -> None:
    if not path.exists():
        return

    lines = path.read_text(encoding="utf-8").splitlines()
    output: list[str] = []
    i = 0
    replaced = False
    while i < len(lines):
        line = lines[i]
        output.append(line)
        if line.strip() == heading:
            replaced = True
            output.extend(new_body_lines)
            i += 1
            while i < len(lines) and not lines[i].startswith("## "):
                i += 1
            continue
        i += 1

    if replaced:
        path.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")


def _replace_first_line_with_prefix(path: Path, prefix: str, replacement: str) -> None:
    if not path.exists():
        return

    lines = path.read_text(encoding="utf-8").splitlines()
    for idx, line in enumerate(lines):
        if line.startswith(prefix):
            lines[idx] = replacement
            path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
            return


def _augment_scaffold_map(repo_root: Path, output_root: Path) -> None:
    if not (repo_root / ".agents" / "scripts").exists():
        return

    runtime_surfaces = [
        "",
        "- `.agents/scripts`: Python command surface for governance, validation, bootstrap, repo maps, and runtime adapters.",
        "- `docs/`: Canonical project documentation surface for standards, architecture, patterns, templates, and telemetry guidance.",
        "- `.agents/skills`: Project-local skill surface synced into the repository for interactive runtimes.",
        "- `AGENTS.md` and `CLAUDE.md`: Operator/runtime instruction entrypoints; OpenCode, Qwen, Gemini, and Codex use `AGENTS.md` directly or global runtime config.",
    ]
    _replace_section(output_root / "README.md", "## Major Runtime Surfaces", runtime_surfaces)

    architecture_intro = [
        "",
        "- Python utilities or service-side scripts are present and should be considered part of the operating surface.",
        "- Dominant feature clusters: `.agents/scripts, docs, .agents/skills`.",
        "- Public boundaries currently concentrate in `.agents/agents`, `Makefile`, and the runtime instruction entrypoints.",
    ]
    _replace_section(output_root / "ARCHITECTURE.md", "## What This System Appears To Do", architecture_intro)

    domain_bullets = [
        "",
        "- `.agents/scripts`: Operational Python command family for doctor, bootstrap, sync, repo-map, workbench, and validation flows.",
        "- `docs/`: Standards, templates, goal-state canon, patterns, telemetry docs, and other project-facing documentation surfaces.",
        "- `.agents/skills`: Repo-local skill payloads selected for interactive runtimes.",
        "- Runtime instruction entrypoints (`AGENTS.md` and the Claude mirror): Thin contract surfaces for interactive runtimes.",
    ]
    _replace_section(output_root / "ARCHITECTURE.md", "## Why The Main Domains Exist", domain_bullets)

    cli_entrypoints = [item for item in [repo_root / ".agents" / "agents", repo_root / "Makefile"] if item.exists()]
    runtime_docs = [
        path
        for path in [
            repo_root / "AGENTS.md",
            repo_root / "CLAUDE.md",
        ]
        if path.exists()
    ]
    command_scripts = sorted((repo_root / ".agents" / "scripts").glob("agents-*.py"))

    api_counts = [
        "",
        f"- CLI entrypoints: `{len(cli_entrypoints)}`",
        f"- Runtime instruction entrypoints: `{len(runtime_docs)}`",
        f"- Command script boundaries: `{len(command_scripts)}`",
    ]
    _replace_section(output_root / "API_MAP.md", "## Public Boundary Counts", api_counts)

    api_boundaries = [""] + [f"- `{path.relative_to(repo_root)}`" for path in [*cli_entrypoints, *runtime_docs]]
    _replace_section(output_root / "API_MAP.md", "## Public Boundary Files", api_boundaries)

    supporting_surfaces = [
        "",
        "- `.agents/agents.config`: Repository-local runtime, path, and skills-sync contract.",
        "- `.agents/tools.json`: Tool catalog surfaced by the wrapper and tools commands.",
        "- `.agents/skills-sync.manifest.json`: Pinned project-local skills selection and source contract.",
        "- `.claude/`: Secret-free Claude adapter notes and rule links committed with the scaffold.",
    ]
    _replace_section(output_root / "API_MAP.md", "## Supporting Integration And Contract Surfaces", supporting_surfaces)

    _replace_first_line_with_prefix(
        output_root / "LLM_QUICKSTART.md",
        "- Runtime surfaces:",
        "- Runtime surfaces: `.agents/scripts`, `docs/`, `.agents/skills`, `AGENTS.md`, `CLAUDE.md`",
    )


def _validate_semantic_signals(output_root: Path) -> None:
    problems: list[str] = []

    for rel_path, markers in DEGENERATE_MARKERS.items():
        path = output_root / rel_path
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        for marker in markers:
            if marker in content:
                problems.append(f"{rel_path} contains degenerate marker: {marker}")

    readme_body = _extract_section_body(output_root / "README.md", "## Major Runtime Surfaces")
    if not readme_body:
        problems.append("README.md is missing Major Runtime Surfaces content")
    if ".agents/scripts" not in readme_body:
        problems.append("README.md does not mention .agents/scripts in Major Runtime Surfaces")

    if problems:
        raise RuntimeError("Repo map run completed but semantic validation failed:\n- " + "\n- ".join(problems))


def _print_summary(repo_root: Path, output_root: Path, runner: Path, image: str, generated: list[Path]) -> None:
    print("Agents Repo Map")
    print(f"repo: {repo_root}")
    print(f"output: {output_root}")
    print(f"runner: {runner}")
    print(f"image: {image}")
    print("generated_artifacts:")
    for path in generated:
        print(f" - {path}")


def _normalize_map_readme(output_root: Path) -> None:
    readme_path = output_root / "README.md"
    if not readme_path.exists():
        return

    content = readme_path.read_text(encoding="utf-8")
    if "current-state, descriptive" in content and SCAFFOLD_CONTRACT_HEADING in content:
        return

    if SCAFFOLD_CONTRACT_HEADING not in content:
        marker = "## Read This First"
        if marker in content:
            content = content.replace(marker, f"{SCAFFOLD_CONTRACT_BLOCK}{marker}", 1)
        else:
            content = f"{content.rstrip()}\n\n{SCAFFOLD_CONTRACT_BLOCK}"
    elif "current-state, descriptive" not in content:
        content = content.replace(
            SCAFFOLD_CONTRACT_HEADING,
            (
                f"{SCAFFOLD_CONTRACT_HEADING}\n\n"
                "- `docs/map/` is the current-state, descriptive evidence surface for repository mapping."
            ),
            1,
        )

    readme_path.write_text(content.rstrip() + "\n", encoding="utf-8")


def _analysis_ignore(repo_root: Path):
    def _ignore(current_dir: str, names: list[str]) -> set[str]:
        current = Path(current_dir)
        ignored: set[str] = set()
        for name in names:
            candidate = current / name
            rel = candidate.relative_to(repo_root).as_posix()
            if name in ANALYSIS_EXCLUDES or rel in ANALYSIS_EXCLUDES:
                ignored.add(name)
                continue
            if any(rel.startswith(f"{prefix}/") for prefix in ANALYSIS_EXCLUDES if "/" in prefix):
                ignored.add(name)
        return ignored

    return _ignore


def _prepare_shadow_repo(repo_root: Path) -> tuple[Path, Path]:
    staging_root = Path(tempfile.mkdtemp(prefix=f"agents-repo-map-{repo_root.name}-"))
    shadow_repo = staging_root / repo_root.name
    shutil.copytree(repo_root, shadow_repo, ignore=_analysis_ignore(repo_root))
    return staging_root, shadow_repo


def _sync_generated_output(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest)


def main() -> int:
    args = parse_args()
    try:
        repo_root = _resolve_repo(args.repo)
        output_root = _resolve_output(repo_root, args.output)
        runner = _resolve_runner(args.runner)
    except Exception as exc:
        print(f"❌ {exc}")
        return 1

    staging_root, shadow_repo = _prepare_shadow_repo(repo_root)
    shadow_output = staging_root / "map-output"
    cmd = [str(runner), str(shadow_repo), str(shadow_output), str(args.image)]
    print(f"Source repo: {repo_root}")
    print(f"Final output root: {output_root}")
    print(f"Analysis shadow repo: {shadow_repo}")
    print("Resolved repo-map command:")
    print(" ".join(cmd))

    if args.dry_run:
        shutil.rmtree(staging_root, ignore_errors=True)
        return 0

    try:
        result = run_command(cmd, cwd=shadow_repo)
        if result.returncode != 0:
            print(f"❌ repo-map runner failed with exit code {result.returncode}")
            return result.returncode

        generated = _validate_generated_docs(shadow_output, DEFAULT_REQUIRED_DOCS)
        _normalize_map_readme(shadow_output)
        _augment_scaffold_map(repo_root, shadow_output)
        _validate_semantic_signals(shadow_output)
        _sync_generated_output(shadow_output, output_root)
    except Exception as exc:
        print(f"❌ {exc}")
        return 1
    finally:
        shutil.rmtree(staging_root, ignore_errors=True)

    _print_summary(repo_root, output_root, runner, args.image, generated)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
