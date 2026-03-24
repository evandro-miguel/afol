#!/usr/bin/env python3
"""Generate or refresh the full repository codemap under `.agents/arc/map/`."""

from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path
from typing import Iterable, List

from lib.agents_config import load_agents_config


ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
MAP_CFG = CONFIG.get("repo_map", {})
PATHS_CFG = CONFIG.get("paths", {})
DEFAULT_OUTPUT_DIR = str(PATHS_CFG.get("map_dir", ".agents/arc/map")).strip() or ".agents/arc/map"
DEFAULT_IMAGE = str(MAP_CFG.get("docker_image", "docker-analisys-tools:latest")).strip() or "docker-analisys-tools:latest"
DEFAULT_REQUIRED_DOCS = [str(item) for item in MAP_CFG.get("required_root_docs", ["README.md"]) if str(item).strip()]
DEFAULT_RUNNER_HINT = Path.home() / "apps" / "docker-analisys-tools" / "scripts" / "run-repo-map.sh"
SCAFFOLD_CONTRACT_HEADING = "## Scaffold Contract"
SCAFFOLD_CONTRACT_BLOCK = "\n".join(
    [
        SCAFFOLD_CONTRACT_HEADING,
        "",
        "- `.agents/arc/map/` is the current-state, descriptive evidence surface for repository mapping.",
        "- Goal-state canon stays outside this folder in `.agents/arc/`, roadmap, specs, ADRs, and related architecture docs.",
        "- Use this map for refreshable observation and analysis, not as approval authority for desired-state decisions.",
        "",
    ]
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate or refresh the repository codemap under .agents/arc/map")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root to analyze (default: current directory)")
    parser.add_argument("--output", help="Map output directory (default: <repo>/.agents/arc/map)")
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
                "- `.agents/arc/map/` is the current-state, descriptive evidence surface for repository mapping."
            ),
            1,
        )

    readme_path.write_text(content.rstrip() + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    try:
        repo_root = _resolve_repo(args.repo)
        output_root = _resolve_output(repo_root, args.output)
        runner = _resolve_runner(args.runner)
    except Exception as exc:
        print(f"❌ {exc}")
        return 1

    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "extra" / "changelogs").mkdir(parents=True, exist_ok=True)

    cmd = [str(runner), str(repo_root), str(output_root), str(args.image)]
    print("Resolved repo-map command:")
    print(" ".join(cmd))

    if args.dry_run:
        return 0

    result = subprocess.run(cmd, cwd=repo_root)
    if result.returncode != 0:
        print(f"❌ repo-map runner failed with exit code {result.returncode}")
        return result.returncode

    try:
        generated = _validate_generated_docs(output_root, DEFAULT_REQUIRED_DOCS)
        _normalize_map_readme(output_root)
    except Exception as exc:
        print(f"❌ {exc}")
        return 1

    _print_summary(repo_root, output_root, runner, args.image, generated)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
