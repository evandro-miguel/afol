#!/usr/bin/env python3
"""Generate HTML viewer for skill evaluation results."""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


def load_iteration_data(iteration_dir: str) -> dict:
    """Load grading.json and related files from iteration directory."""
    iteration_path = Path(iteration_dir)

    data = {
        "iteration_dir": str(iteration_path),
        "grading": None,
        "timing": None,
        "metrics": None,
    }

    # Load grading.json
    grading_file = iteration_path / "grading.json"
    if grading_file.exists():
        data["grading"] = json.loads(grading_file.read_text())

    # Load timing.json if exists
    timing_file = iteration_path / "timing.json"
    if timing_file.exists():
        data["timing"] = json.loads(timing_file.read_text())

    # Load metrics.json if exists
    metrics_file = iteration_path / "metrics.json"
    if metrics_file.exists():
        data["metrics"] = json.loads(metrics_file.read_text())

    return data


def load_benchmark_data(benchmark_path: str) -> dict:
    """Load benchmark.json if provided."""
    path = Path(benchmark_path)
    if path.exists():
        return json.loads(path.read_text())
    return {}


def generate_html(
    data: dict,
    auto_refresh: bool = False,
    skill_name: str = "",
    benchmark: dict = None,
) -> str:
    """Generate HTML viewer for evaluation results."""

    if benchmark is None:
        benchmark = {}

    grading = data.get("grading", {})
    summary = grading.get("summary", {})
    results = grading.get("results", [])
    timing = data.get("timing", {})
    metrics = data.get("metrics", {})

    # Calculate stats
    total = summary.get("total", 0)
    passed = summary.get("passed", 0)
    pass_rate = summary.get("pass_rate", 0)

    # Build results table rows
    rows_html = ""
    for result in results:
        eval_id = result.get("eval_id", "?")
        prompt = result.get("prompt", "")[:60]
        should_trigger = result.get("should_trigger", True)
        triggered = result.get("triggered", False)
        passed = result.get("passed", False)
        evidence = result.get("evidence", "")

        # Determine row class
        if should_trigger and triggered:
            row_class = "train-positive"
            status = "TRIGGERED ✓"
        elif not should_trigger and not triggered:
            row_class = "train-negative"
            status = "CORRECTLY SKIPPED ✓"
        elif should_trigger and not triggered:
            row_class = "train-negative"
            status = "FAILED TO TRIGGER ✗"
        else:
            row_class = "train-positive"
            status = "FALSE TRIGGER ✗"

        rows_html += f"""
        <tr class="{row_class}">
            <td>{eval_id}</td>
            <td class="prompt">{prompt}...</td>
            <td>{status}</td>
            <td>{evidence[:50]}</td>
        </tr>
"""

    # Benchmark comparison section
    benchmark_html = ""
    if benchmark:
        run_summary = benchmark.get("run_summary", {})
        with_skill = run_summary.get("with_skill", {})
        without_skill = run_summary.get("without_skill", {})
        delta = run_summary.get("delta", {})

        benchmark_html = f"""
    <section class="benchmark">
        <h2>Benchmark Comparison</h2>
        <table class="benchmark-table">
            <tr>
                <th>Configuration</th>
                <th>Mean</th>
                <th>Std Dev</th>
                <th>Min</th>
                <th>Max</th>
            </tr>
            <tr>
                <td><strong>With Skill</strong></td>
                <td class="positive">{with_skill.get('mean', 0):.2%}</td>
                <td>{with_skill.get('stddev', 0):.2%}</td>
                <td>{with_skill.get('min', 0):.2%}</td>
                <td>{with_skill.get('max', 0):.2%}</td>
            </tr>
            <tr>
                <td><strong>Without Skill</strong></td>
                <td>{without_skill.get('mean', 0):.2%}</td>
                <td>{without_skill.get('stddev', 0):.2%}</td>
                <td>{without_skill.get('min', 0):.2%}</td>
                <td>{without_skill.get('max', 0):.2%}</td>
            </tr>
            <tr class="delta-row">
                <td><strong>Delta</strong></td>
                <td class="{'positive' if delta.get('pass_rate_improvement', 0) > 0 else 'negative'}">
                    {delta.get('pass_rate_improvement', 0):+.2%}
                </td>
                <td colspan="3">
                    Effect Size: {delta.get('effect_size', 0):.2f} |
                    Significant: {"Yes" if delta.get('statistically_significant', False) else "No"}
                </td>
            </tr>
        </table>
    </section>
"""

    # Auto-refresh meta tag
    refresh_meta = '<meta http-equiv="refresh" content="30">' if auto_refresh else ""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    {refresh_meta}
    <title>{skill_name} - Evaluation Results</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {{
            --header-bg: #141413;
            --body-bg: #faf9f5;
            --text-color: #333;
            --positive: #22c55e;
            --negative: #ef4444;
            --border: #e5e5e5;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Lora', serif;
            background: var(--body-bg);
            color: var(--text-color);
            line-height: 1.6;
        }}

        header {{
            background: var(--header-bg);
            color: white;
            padding: 1.5rem 2rem;
            margin-bottom: 2rem;
        }}

        header h1 {{
            font-family: 'Poppins', sans-serif;
            font-weight: 600;
            font-size: 1.5rem;
        }}

        header p {{
            opacity: 0.8;
            font-size: 0.9rem;
            margin-top: 0.5rem;
        }}

        main {{
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem 2rem;
        }}

        section {{
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }}

        h2 {{
            font-family: 'Poppins', sans-serif;
            font-weight: 600;
            font-size: 1.25rem;
            margin-bottom: 1rem;
            color: var(--header-bg);
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
        }}

        th, td {{
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }}

        th {{
            background: #f5f5f5;
            font-family: 'Poppins', sans-serif;
            font-weight: 500;
        }}

        .prompt {{
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }}

        .train-positive {{
            background: rgba(34, 197, 94, 0.1);
        }}

        .train-negative {{
            background: rgba(239, 68, 68, 0.1);
        }}

        .positive {{
            color: var(--positive);
            font-weight: 600;
        }}

        .negative {{
            color: var(--negative);
            font-weight: 600;
        }}

        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-bottom: 1.5rem;
        }}

        .stat-card {{
            background: #f5f5f5;
            padding: 1rem;
            border-radius: 6px;
            text-align: center;
        }}

        .stat-value {{
            font-family: 'Poppins', sans-serif;
            font-size: 2rem;
            font-weight: 600;
        }}

        .stat-label {{
            font-size: 0.85rem;
            color: #666;
            margin-top: 0.25rem;
        }}

        .benchmark-table {{
            margin-top: 1rem;
        }}

        .benchmark-table .delta-row {{
            background: #f0f0f0;
            font-weight: 600;
        }}

        .legend {{
            display: flex;
            gap: 1.5rem;
            flex-wrap: wrap;
            margin-bottom: 1rem;
            font-size: 0.85rem;
        }}

        .legend-item {{
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }}

        .legend-color {{
            width: 16px;
            height: 16px;
            border-radius: 3px;
        }}

        @media (max-width: 768px) {{
            header h1 {{
                font-size: 1.25rem;
            }}

            main {{
                padding: 0 1rem 1rem;
            }}

            table {{
                font-size: 0.8rem;
            }}

            th, td {{
                padding: 0.5rem;
            }}
        }}
    </style>
</head>
<body>
    <header>
        <h1>{skill_name or 'Skill'} - Evaluation Results</h1>
        <p>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        {f'<p>Iteration: {data.get("iteration_dir", "N/A")}</p>' if data.get('iteration_dir') else ''}
    </header>

    <main>
        <section>
            <h2>Summary</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value {'positive' if pass_rate >= 0.8 else 'negative' if pass_rate < 0.5 else ''}">
                        {pass_rate:.2%}
                    </div>
                    <div class="stat-label">Pass Rate</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{passed}</div>
                    <div class="stat-label">Passed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{total}</div>
                    <div class="stat-label">Total</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{timing.get('duration_ms', 0) / 1000:.1f}s</div>
                    <div class="stat-label">Duration</div>
                </div>
            </div>

            <div class="legend">
                <div class="legend-item">
                    <div class="legend-color" style="background: rgba(34, 197, 94, 0.1);"></div>
                    <span>Should trigger + triggered (train positive)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: rgba(239, 68, 68, 0.1);"></div>
                    <span>Should not trigger + skipped (train negative)</span>
                </div>
            </div>
        </section>

        {benchmark_html}

        <section>
            <h2>Individual Results</h2>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Prompt</th>
                        <th>Status</th>
                        <th>Evidence</th>
                    </tr>
                </thead>
                <tbody>
                    {rows_html}
                </tbody>
            </table>
        </section>
    </main>
</body>
</html>
"""

    return html


def main():
    parser = argparse.ArgumentParser(description="Generate HTML evaluation viewer")
    parser.add_argument(
        "iteration_dir",
        nargs="?",
        help="Iteration directory with grading.json",
    )
    parser.add_argument(
        "--skill-name",
        default="",
        help="Skill name for display",
    )
    parser.add_argument(
        "--benchmark",
        help="Path to benchmark.json for comparison",
    )
    parser.add_argument(
        "--auto-refresh",
        action="store_true",
        help="Auto-refresh every 30 seconds",
    )
    parser.add_argument(
        "--static",
        help="Output to static file path (for WSL/headless)",
    )
    parser.add_argument(
        "--output",
        default="eval-viewer.html",
        help="Output HTML file path",
    )

    args = parser.parse_args()

    # Load iteration data
    if args.iteration_dir:
        data = load_iteration_data(args.iteration_dir)
    else:
        # Try to find most recent iteration
        import glob

        iterations = sorted(glob.glob("evals/iteration-*"), reverse=True)
        if iterations:
            data = load_iteration_data(iterations[0])
        else:
            print("Error: No iteration directory specified or found")
            sys.exit(1)

    # Load benchmark if provided
    benchmark = None
    if args.benchmark:
        benchmark = load_benchmark_data(args.benchmark)

    # Generate HTML
    html = generate_html(data, args.auto_refresh, args.skill_name, benchmark)

    # Output
    if args.static:
        Path(args.static).write_text(html)
        print(f"Static HTML written to: {args.static}")
    else:
        Path(args.output).write_text(html)
        print(f"HTML written to: {args.output}")

        # Try to open in browser (works on most systems)
        try:
            import webbrowser

            webbrowser.open(f"file://{Path(args.output).absolute()}")
        except:
            print("Open in browser manually: file://" + str(Path(args.output).absolute()))


if __name__ == "__main__":
    main()