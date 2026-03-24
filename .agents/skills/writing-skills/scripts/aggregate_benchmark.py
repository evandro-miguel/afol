#!/usr/bin/env python3
"""Aggregate individual run results into benchmark summary statistics."""

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_run_results(benchmark_dir: str) -> list[dict[str, Any]]:
    """Load grading.json from run directories.

    Supports both layouts:
    - eval-N/with_skill/run-M/grading.json
    - runs/eval-N/with_skill/run-M/grading.json
    """
    benchmark_path = Path(benchmark_dir)
    results = []

    # Try both directory structures
    possible_layouts = [
        benchmark_path,
        benchmark_path / "runs",
    ]

    for layout in possible_layouts:
        if not layout.exists():
            continue

        # Find all grading.json files
        for grading_file in layout.rglob("grading.json"):
            # Extract metadata from path
            parts = grading_file.parts
            try:
                # Find eval-N and with_skill/without_skill
                eval_idx = None
                config = None
                run_idx = None

                for i, part in enumerate(parts):
                    if part.startswith("eval-"):
                        eval_idx = int(part.replace("eval-", ""))
                    if part in ("with_skill", "without_skill"):
                        config = part
                    if part.startswith("run-"):
                        run_idx = int(part.replace("run-", ""))

                if eval_idx is not None and config:
                    result = {
                        "eval_id": eval_idx,
                        "configuration": config,
                        "run_id": run_idx,
                        "grading": json.loads(grading_file.read_text()),
                        "path": str(grading_file),
                    }
                    results.append(result)
            except Exception as e:
                print(f"Warning: Failed to parse {grading_file}: {e}", file=sys.stderr)

    return results


def calculate_stats(values: list[float]) -> dict[str, float]:
    """Return mean, stddev, min, max."""
    if not values:
        return {"mean": 0, "stddev": 0, "min": 0, "max": 0}

    n = len(values)
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / n
    stddev = variance ** 0.5

    return {
        "mean": mean,
        "stddev": stddev,
        "min": min(values),
        "max": max(values),
    }


def aggregate_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculate per-configuration stats and delta."""

    with_skill = [r for r in results if r.get("configuration") == "with_skill"]
    without_skill = [r for r in results if r.get("configuration") == "without_skill"]

    # Calculate pass rates for each run
    def get_pass_rate(grading: dict[str, Any]) -> float:
        summary = grading.get("summary", {})
        total = summary.get("total", 0)
        passed = summary.get("passed", 0)
        return passed / total if total > 0 else 0

    with_skill_rates = [get_pass_rate(r["grading"]) for r in with_skill]
    without_skill_rates = [get_pass_rate(r["grading"]) for r in without_skill]

    # Calculate stats
    with_skill_stats = calculate_stats(with_skill_rates)
    without_skill_stats = calculate_stats(without_skill_rates)

    # Calculate delta
    delta = with_skill_stats["mean"] - without_skill_stats["mean"]

    # Check statistical significance (simple t-test approximation)
    # Using Cohen's d for effect size
    pooled_std = (
        ((with_skill_stats["stddev"] ** 2 + without_skill_stats["stddev"] ** 2) / 2)
        ** 0.5
    )
    effect_size = abs(delta) / pooled_std if pooled_std > 0 else 0
    statistically_significant = effect_size > 0.5  # Cohen's d > 0.5

    return {
        "with_skill": with_skill_stats,
        "without_skill": without_skill_stats,
        "delta": {
            "pass_rate_improvement": delta,
            "effect_size": effect_size,
            "statistically_significant": statistically_significant,
        },
    }


def generate_markdown(benchmark: dict[str, Any], output_path: Path) -> None:
    """Generate human-readable benchmark.md with summary table."""

    md = f"""# Benchmark Results

Generated: {benchmark.get("metadata", {}).get("created_at", "N/A")}

## Summary

| Configuration | Mean | Std Dev | Min | Max |
|---------------|------|---------|-----|-----|
| With Skill    | {benchmark["run_summary"]["with_skill"]["mean"]:.2%} | {benchmark["run_summary"]["with_skill"]["stddev"]:.2%} | {benchmark["run_summary"]["with_skill"]["min"]:.2%} | {benchmark["run_summary"]["with_skill"]["max"]:.2%} |
| Without Skill | {benchmark["run_summary"]["without_skill"]["mean"]:.2%} | {benchmark["run_summary"]["without_skill"]["stddev"]:.2%} | {benchmark["run_summary"]["without_skill"]["min"]:.2%} | {benchmark["run_summary"]["without_skill"]["max"]:.2%} |

## Improvement

- **Delta**: {benchmark["run_summary"]["delta"]["pass_rate_improvement"]:+.2%}
- **Effect Size (Cohen's d)**: {benchmark["run_summary"]["delta"]["effect_size"]:.2f}
- **Statistically Significant**: {"Yes" if benchmark["run_summary"]["delta"]["statistically_significant"] else "No"}

## Individual Runs

### With Skill

| Eval ID | Run | Pass Rate |
|---------|-----|-----------|
"""

    # Add run details
    for run in benchmark.get("runs", []):
        config = run.get("configuration", "")
        eval_id = run.get("eval_id", "?")
        run_id = run.get("run_id", "?")
        pass_rate = run.get("pass_rate", 0)

        if config == "with_skill":
            md += f"| {eval_id} | {run_id} | {pass_rate:.2%} |\n"

    md += "\n### Without Skill\n\n| Eval ID | Run | Pass Rate |\n|---------|-----|-----------|\n"

    for run in benchmark.get("runs", []):
        config = run.get("configuration", "")
        eval_id = run.get("eval_id", "?")
        run_id = run.get("run_id", "?")
        pass_rate = run.get("pass_rate", 0)

        if config == "without_skill":
            md += f"| {eval_id} | {run_id} | {pass_rate:.2%} |\n"

    output_path.write_text(md)
    print(f"Written: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Aggregate run results into benchmark statistics"
    )
    parser.add_argument(
        "--benchmark-dir", required=True, help="Directory containing run results"
    )
    parser.add_argument(
        "--skill-name", help="Skill name for metadata"
    )
    parser.add_argument(
        "--output", help="Output JSON file (default: benchmark.json)"
    )
    parser.add_argument(
        "--markdown",
        action="store_true",
        help="Also generate benchmark.md",
    )

    args = parser.parse_args()

    # Load results
    results = load_run_results(args.benchmark_dir)

    if not results:
        print("No results found")
        sys.exit(1)

    print(f"Loaded {len(results)} run results")

    # Aggregate
    run_summary = aggregate_results(results)

    # Build benchmark structure
    benchmark = {
        "metadata": {
            "skill_name": args.skill_name or "unknown",
            "created_at": (
                __import__("datetime").datetime.now().isoformat()
            ),
            "total_runs": len(results),
        },
        "runs": [
            {
                "eval_id": r["eval_id"],
                "configuration": r["configuration"],
                "run_id": r.get("run_id"),
                "pass_rate": r["grading"].get("summary", {}).get("pass_rate", 0),
            }
            for r in results
        ],
        "run_summary": run_summary,
    }

    # Output JSON
    output_json = json.dumps(benchmark, indent=2)

    output_path = args.output or "benchmark.json"
    Path(output_path).write_text(output_json)
    print(f"Written: {output_path}")

    # Generate markdown if requested
    if args.markdown:
        generate_markdown(benchmark, Path(output_path).with_suffix(".md"))


if __name__ == "__main__":
    main()