#!/usr/bin/env python3
"""Run eval + improve loop until all pass or max iterations.

Combines run_eval.py and improve_description.py.
Supports train/test split to prevent overfitting.
Platform-agnostic: works with OpenCode, Claude Code, Codex.
"""

import argparse
import json
import random
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# Add parent directory to path for utils import
sys.path.insert(0, str(Path(__file__).parent))


def load_eval_set(eval_set_path: str) -> dict[str, Any]:
    """Load eval set from JSON file."""
    path = Path(eval_set_path)
    if not path.exists():
        raise FileNotFoundError(f"Eval set not found: {eval_set_path}")
    return json.loads(path.read_text())


def split_eval_set(eval_set: dict[str, Any], holdout: float, seed: int = 42) -> tuple[list, list]:
    """Split into train/test, stratified by should_trigger."""
    random.seed(seed)

    evals = eval_set.get("evals", [])

    # Stratify by should_trigger
    train_evals = []
    test_evals = []

    trigger_true = [e for e in evals if e.get("should_trigger", True)]
    trigger_false = [e for e in evals if not e.get("should_trigger", True)]

    # Shuffle each group
    random.shuffle(trigger_true)
    random.shuffle(trigger_false)

    # Split each group
    train_tt = int(len(trigger_true) * (1 - holdout))
    train_tf = int(len(trigger_false) * (1 - holdout))

    train_evals = trigger_true[:train_tt] + trigger_false[:train_tf]
    test_evals = trigger_true[train_tt:] + trigger_false[train_tf:]

    # Re-shuffle train and test
    random.shuffle(train_evals)
    random.shuffle(test_evals)

    return train_evals, test_evals


def run_evaluation(
    eval_set: dict[str, Any],
    skill_path: str,
    cli_tool: str,
    timeout: int,
    runs_per_query: int,
    output_dir: str,
    tier: int = 2,
    verbose: bool = False,
) -> dict[str, Any]:
    """Run evaluation using run_eval.py."""

    # Write temporary eval set for this run
    temp_eval = Path(output_dir) / "temp_eval.json"
    temp_eval.write_text(json.dumps(eval_set, indent=2))

    cmd = [
        sys.executable,
        str(Path(__file__).parent / "run_eval.py"),
        "--eval-set", str(temp_eval),
        "--skill-path", skill_path,
        "--cli-tool", cli_tool,
        "--timeout", str(timeout),
        "--runs-per-query", str(runs_per_query),
        "--tier", str(tier),
        "--output", str(output_dir),
    ]

    if verbose:
        print(f"Running: {' '.join(cmd)}")

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"Error running eval: {result.stderr}", file=sys.stderr)
        return {"error": result.stderr, "results": []}

    # Try to find grading results
    grading_file = Path(output_dir) / "grading.json"
    if grading_file.exists():
        return json.loads(grading_file.read_text())

    # Otherwise return parsed stdout
    try:
        # Extract JSON from output
        output_lines = result.stdout.strip().split("\n")
        for line in reversed(output_lines):
            if line.startswith("{"):
                return json.loads(line)
    except:
        pass

    return {"error": "No results found", "results": []}


def calculate_pass_rate(results: list[dict[str, Any]]) -> float:
    """Calculate pass rate from evaluation results."""
    if not results:
        return 0.0

    total = len(results)
    passed = sum(1 for r in results if r.get("passed", False))

    return passed / total if total > 0 else 0.0


def calculate_combined_score(results: dict[str, Any]) -> float:
    """Calculate combined score from trigger + grader results.

    Combines:
    - Trigger pass rate (50%)
    - Expectations pass rate from grader (50%)
    """
    # Trigger score
    trigger_results = results.get("results", [])
    trigger_score = calculate_pass_rate(trigger_results)

    # Grader score (from grader_results)
    grader_results = results.get("grader_results", [])
    if grader_results:
        grader_scores = []
        for grader in grader_results:
            summary = grader.get("summary", {})
            if summary:
                grader_scores.append(summary.get("pass_rate", 0))

        grader_score = sum(grader_scores) / len(grader_scores) if grader_scores else 0
    else:
        grader_score = None  # No grader data

    # Combined score
    if grader_score is not None:
        # Weight: 50% trigger, 50% grader
        combined = (trigger_score * 0.5) + (grader_score * 0.5)
    else:
        # Only trigger data available
        combined = trigger_score

    return combined


def update_skill_description(skill_path: str, new_description: str) -> None:
    """Update the description in SKILL.md."""
    skill_file = Path(skill_path)
    if not skill_file.exists():
        raise FileNotFoundError(f"Skill file not found: {skill_path}")

    content = skill_file.read_text()

    # Replace description line
    import re
    new_content = re.sub(
        r'^description:\s*.+$',
        f'description: {new_description}',
        content,
        flags=re.MULTILINE,
    )

    skill_file.write_text(new_content)


def generate_html_report(
    history: list[dict[str, Any]],
    output_dir: Path,
    skill_name: str,
) -> None:
    """Generate simple HTML report for the run loop."""

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>{skill_name} - Iteration Results</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }}
        h1 {{ color: #333; }}
        table {{ border-collapse: collapse; width: 100%; max-width: 800px; }}
        th, td {{ border: 1px solid #ddd; padding: 12px; text-align: left; }}
        th {{ background: #f5f5f5; }}
        .pass {{ color: green; }}
        .fail {{ color: red; }}
        .best {{ background: #e8f5e9; }}
        .iteration {{ background: #f9f9f9; }}
    </style>
</head>
<body>
    <h1>{skill_name} - Improvement Loop Results</h1>
    <p>Generated: {datetime.now().isoformat()}</p>
    <table>
        <tr>
            <th>Iteration</th>
            <th>Train Score</th>
            <th>Test Score</th>
            <th>Changes</th>
        </tr>
"""

    best_idx = 0
    best_test = -1
    for i, h in enumerate(history):
        train = h.get("train_score", 0)
        test = h.get("test_score", 0)
        if test > best_test:
            best_test = test
            best_idx = i
        row_class = "best" if i == best_idx else "iteration"
        html += f"""        <tr class="{row_class}">
            <td>{h.get('iteration', i + 1)}</td>
            <td>{train:.2%}</td>
            <td>{test:.2%}</td>
            <td>{h.get('changes', 'Initial')}</td>
        </tr>
"""

    html += """    </table>
    <h2>Best by Test Score (avoids overfitting)</h2>
    <p>Select the iteration with highest TEST score, not train score.</p>
</body>
</html>
"""

    (output_dir / "report.html").write_text(html)
    print(f"Report: {output_dir / 'report.html'}")


def run_loop(
    eval_set: dict[str, Any],
    skill_path: str,
    max_iterations: int,
    holdout: float,
    cli_tool: str,
    timeout: int,
    runs_per_query: int,
    model: str,
    output_dir: str,
    verbose: bool = False,
) -> dict[str, Any]:
    """Main loop: evaluate, improve, repeat until all pass or max iterations."""

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Split eval set
    train_evals, test_evals = split_eval_set(eval_set, holdout)

    train_set = {"skill_name": eval_set.get("skill_name", "unknown"), "evals": train_evals}
    test_set = {"skill_name": eval_set.get("skill_name", "unknown"), "evals": test_evals}

    print(f"Train: {len(train_evals)} evals, Test: {len(test_evals)} evals")

    history = []
    best_description = None
    best_test_score = -1

    skill_name = Path(skill_path).parent.name

    # Determine tier from skill structure
    tier = 2  # Default to tier 2
    skill_dir = Path(skill_path).parent
    if (skill_dir / "products").exists():
        tier = 3
    elif not (skill_dir / "references").exists():
        tier = 1

    for iteration in range(1, max_iterations + 1):
        print(f"\n=== Iteration {iteration}/{max_iterations} ===")

        iteration_dir = output_path / f"iteration-{iteration}"
        iteration_dir.mkdir(exist_ok=True)

        # Run evaluation on train set
        print("Evaluating on train set...")
        train_results = run_evaluation(
            train_set,
            skill_path,
            cli_tool,
            timeout,
            runs_per_query,
            str(iteration_dir / "train"),
            tier,
            verbose,
        )
        train_score = calculate_combined_score(train_results)

        # Run evaluation on test set
        print("Evaluating on test set...")
        test_results = run_evaluation(
            test_set,
            skill_path,
            cli_tool,
            timeout,
            runs_per_query,
            str(iteration_dir / "test"),
            tier,
            verbose,
        )
        test_score = calculate_combined_score(test_results)

        print(f"Train score: {train_score:.2%}, Test score: {test_score:.2%}")

        # Record in history
        history.append({
            "iteration": iteration,
            "train_score": train_score,
            "test_score": test_score,
            "timestamp": datetime.now().isoformat(),
        })

        # Check if all pass on test (goal achieved)
        if test_score >= 1.0:
            print("All test cases pass! Stopping.")
            best_test_score = test_score
            break

        # Check if not making progress (same score 3x)
        if len(history) >= 3:
            recent = history[-3:]
            if len(set(h["test_score"] for h in recent)) == 1 and recent[0]["test_score"] == recent[2]["test_score"]:
                print("No progress in last 3 iterations. Stopping.")
                break

        # Track best by test score
        if test_score > best_test_score:
            best_test_score = test_score
            # Save current description as best
            skill_content = Path(skill_path).read_text()
            import re
            match = re.search(r'^description:\s*(.+)$', skill_content, re.MULTILINE)
            if match:
                best_description = match.group(1).strip()

        # If more iterations to go, try to improve
        if iteration < max_iterations:
            print("Attempting to improve description...")

            # Save grading results for improve_description
            combined_results = {
                "evals": train_evals,
                "results": train_results.get("results", []),
            }
            (iteration_dir / "train_results.json").write_text(json.dumps(combined_results, indent=2))

            # Run improvement
            try:
                improve_cmd = [
                    sys.executable,
                    str(Path(__file__).parent / "improve_description.py"),
                    "--skill-path", skill_path,
                    "--eval-results", str(iteration_dir / "train_results.json"),
                    "--history", str(output_path / "history.json"),
                    "--model", model,
                    "--output", str(iteration_dir / "new_description.txt"),
                ]

                result = subprocess.run(improve_cmd, capture_output=True, text=True)

                if result.returncode == 0:
                    new_desc_path = Path(iteration_dir) / "new_description.txt"
                    if new_desc_path.exists():
                        new_description = new_desc_path.read_text().strip()
                        update_skill_description(skill_path, new_description)
                        history[-1]["changes"] = "Description updated"
                        print(f"New description: {new_description[:100]}...")
                    else:
                        history[-1]["changes"] = "No improvement found"
                else:
                    history[-1]["changes"] = f"Error: {result.stderr[:100]}"
            except Exception as e:
                history[-1]["changes"] = f"Error: {str(e)[:100]}"

        # Save history
        (output_path / "history.json").write_text(json.dumps({
            "skill_name": skill_name,
            "iterations": history,
            "best_description": best_description,
            "best_test_score": best_test_score,
        }, indent=2))

        # Generate/update HTML report
        generate_html_report(history, output_path, skill_name)

    print(f"\n=== Final Results ===")
    print(f"Best test score: {best_test_score:.2%}")
    if best_description:
        print(f"Best description: {best_description[:100]}...")

    return {
        "best_description": best_description,
        "best_test_score": best_test_score,
        "history": history,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Run eval + improve loop for skill description optimization"
    )
    parser.add_argument("--eval-set", required=True, help="Path to evals.json")
    parser.add_argument("--skill-path", required=True, help="Path to SKILL.md")
    parser.add_argument(
        "--max-iterations", type=int, default=10, help="Maximum iterations"
    )
    parser.add_argument(
        "--holdout", type=float, default=0.4, help="Test set proportion (0.0-1.0)"
    )
    parser.add_argument(
        "--cli-tool",
        default="opencode",
        choices=["opencode", "claude", "codex"],
        help="CLI tool to use for evaluation",
    )
    parser.add_argument("--timeout", type=int, default=120, help="Timeout per query")
    parser.add_argument(
        "--runs-per-query", type=int, default=1, help="Runs per query for consistency"
    )
    parser.add_argument(
        "--model",
        default="claude-sonnet-4-20250514",
        help="Model for description improvement",
    )
    parser.add_argument(
        "--output",
        default="evals/loop_output",
        help="Output directory for results",
    )
    parser.add_argument("--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # Load eval set
    eval_set = load_eval_set(args.eval_set)

    # Run loop
    results = run_loop(
        eval_set,
        args.skill_path,
        args.max_iterations,
        args.holdout,
        args.cli_tool,
        args.timeout,
        args.runs_per_query,
        args.model,
        args.output,
        args.verbose,
    )

    # Output final results
    print("\n=== Output ===")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()