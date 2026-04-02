#!/usr/bin/env python3
"""Run trigger evaluation for a skill description.

Tests whether a skill's description causes the agent to trigger.
Supports multiple CLI backends: opencode, claude, codex.
"""

import argparse
import json
import os
import select
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Project root (assume scripts are in skills/writing-skills/scripts/)
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent


@dataclass
class EvalResult:
    """Result of a single evaluation."""

    eval_id: int
    prompt: str
    should_trigger: bool
    triggered: bool
    passed: bool
    evidence: str
    duration_ms: int
    tokens: int
    transcript_path: str = ""
    expectations: list = None


def detect_trigger(output: str, skill_name: str) -> bool:
    """Detect if skill was triggered from output."""
    # Look for skill invocation patterns
    trigger_patterns = [
        f"Using skill: {skill_name}",
        f"Skill triggered: {skill_name}",
        f"Invoking skill: {skill_name}",
        f"Loading skill: {skill_name}",
        f"[skill] {skill_name}",
        f"skill::{skill_name}",
        f"Skill \"{skill_name}\"",  # Opencode format: Skill "ahk-v2"
        f"Skill used: {skill_name}",  # Opencode format: **Skill used:** ahk-v2
        f"skill {skill_name.lower()}",  # Case insensitive match
    ]

    output_lower = output.lower()
    skill_name_lower = skill_name.lower()

    for pattern in trigger_patterns:
        if pattern.lower() in output_lower:
            return True

    # Also check for skill name mention in context of invocation
    if f"skill {skill_name_lower}" in output_lower:
        return True
    if f"'{skill_name_lower}'" in output_lower:
        return True
    if f"\"{skill_name_lower}\"" in output_lower:
        return True

    return False


def run_opencode_query(
    prompt: str,
    skill_path: str,
    project_root: Path,
    timeout: int,
    verbose: bool = False,
) -> tuple[str, int, int]:
    """Run query using OpenCode CLI."""
    # Copy skill to temporary location for this run
    skill_name = Path(skill_path).parent.name
    temp_skill_dir = project_root / ".agent" / "skills" / skill_name
    temp_skill_dir.mkdir(parents=True, exist_ok=True)

    # Copy skill content
    import shutil
    shutil.copy(skill_path, temp_skill_dir / "SKILL.md")

    # Run opencode with the prompt using 'run' subcommand
    # Use shell=True to handle long prompts with proper quoting
    import shlex
    safe_prompt = shlex.quote(prompt)

    # Run from the project root where opencode.json exists
    cmd = f"opencode run {safe_prompt}"
    run_dir = project_root  # Run from project root

    try:
        proc = subprocess.Popen(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # Combine stderr for full transcript
            cwd=str(run_dir),
            text=True,
        )

        stdout, _ = proc.communicate(timeout=timeout)

        # Parse timing from output if available
        duration_ms = 0
        tokens = 0

        # Try to extract metrics from output
        for line in (_.split("\n") if _ else []):
            if "duration" in line.lower():
                try:
                    duration_ms = int(
                        "".join(filter(str.isdigit, line.split("duration")[1][:10]))
                    )
                except:
                    pass

        return stdout, duration_ms, tokens

    except subprocess.TimeoutExpired:
        proc.kill()
        return f"Timeout after {timeout}s", 0, 0
    except Exception as e:
        return f"Error: {e}", 0, 0


def run_claude_query(
    prompt: str,
    skill_path: str,
    project_root: Path,
    timeout: int,
    verbose: bool = False,
) -> tuple[str, int, int]:
    """Run query using Claude Code CLI."""
    # Claude Code doesn't have direct skill loading - this is a placeholder
    # In practice, you'd need to configure the skill in .claude/commands/

    cmd = [
        "claude",
        "-p",
        "--include-partial-messages",
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(project_root),
            text=True,
        )

        stdout, stderr = proc.communicate(input=prompt, timeout=timeout)

        output = stdout + stderr

        # Parse timing
        duration_ms = 0
        tokens = 0

        return output, duration_ms, tokens

    except subprocess.TimeoutExpired:
        proc.kill()
        return f"Timeout after {timeout}s", 0, 0
    except Exception as e:
        return f"Error: {e}", 0, 0


def run_codex_query(
    prompt: str,
    skill_path: str,
    project_root: Path,
    timeout: int,
    verbose: bool = False,
) -> tuple[str, int, int]:
    """Run query using Codex CLI."""
    # Codex uses AGENTS.md - placeholder for implementation

    cmd = ["codex", "-p", prompt]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(project_root),
            text=True,
        )

        stdout, stderr = proc.communicate(timeout=timeout)

        output = stdout + stderr

        return output, 0, 0

    except subprocess.TimeoutExpired:
        proc.kill()
        return f"Timeout after {timeout}s", 0, 0
    except Exception as e:
        return f"Error: {e}", 0, 0


def run_single_query(
    query: dict[str, Any],
    skill_path: str,
    cli_tool: str,
    project_root: Path,
    timeout: int,
    output_dir: str = None,
    verbose: bool = False,
) -> EvalResult:
    """Run a single evaluation query."""
    eval_id = query.get("id", 0)
    prompt = query.get("prompt", "")
    should_trigger = query.get("should_trigger", True)
    expectations = query.get("expectations", [])

    skill_name = Path(skill_path).parent.name

    if verbose:
        print(f"  Running eval {eval_id}: {prompt[:50]}...")

    start_time = time.time()

    # Run based on CLI tool
    if cli_tool == "opencode":
        output, duration_ms, tokens = run_opencode_query(
            prompt, skill_path, project_root, timeout, verbose
        )
    elif cli_tool == "claude":
        output, duration_ms, tokens = run_claude_query(
            prompt, skill_path, project_root, timeout, verbose
        )
    elif cli_tool == "codex":
        output, duration_ms, tokens = run_codex_query(
            prompt, skill_path, project_root, timeout, verbose
        )
    else:
        raise ValueError(f"Unknown CLI tool: {cli_tool}")

    elapsed_ms = int((time.time() - start_time) * 1000)

    # Save transcript for grader
    transcript_path = ""
    if output_dir:
        transcript_dir = Path(output_dir) / "transcripts"
        transcript_dir.mkdir(parents=True, exist_ok=True)
        transcript_path = str(transcript_dir / f"eval_{eval_id}.txt")
        Path(transcript_path).write_text(output)

    # Detect trigger
    triggered = detect_trigger(output, skill_name)

    # Determine pass/fail
    passed = triggered == should_trigger

    # Evidence
    if triggered and should_trigger:
        evidence = f"Skill triggered as expected"
    elif not triggered and not should_trigger:
        evidence = f"Skill correctly not triggered"
    elif triggered and not should_trigger:
        evidence = f"False trigger: skill activated for unrelated task"
    else:
        evidence = f"Failed to trigger: skill should have activated"

    if verbose:
        status = "PASS" if passed else "FAIL"
        print(f"    {status}: triggered={triggered}, expected={should_trigger}")

    return EvalResult(
        eval_id=eval_id,
        prompt=prompt,
        should_trigger=should_trigger,
        triggered=triggered,
        passed=passed,
        evidence=evidence,
        duration_ms=elapsed_ms,
        tokens=tokens,
        transcript_path=transcript_path,
        expectations=expectations if expectations else None,
    )


def run_eval(
    eval_set: dict[str, Any],
    skill_path: str,
    cli_tool: str,
    project_root: Path,
    timeout: int,
    runs_per_query: int,
    num_workers: int,
    output_dir: str = None,
    tier: int = 2,
    verbose: bool = False,
) -> dict[str, Any]:
    """Run all evaluations in parallel."""

    evals = eval_set.get("evals", [])
    skill_name = eval_set.get("skill_name", Path(skill_path).parent.name)

    if verbose:
        print(f"Running {len(evals)} evaluations with {runs_per_query} runs each")

    # Expand evals to include runs
    all_queries = []
    for eval_item in evals:
        for run in range(runs_per_query):
            query = dict(eval_item)
            query["run"] = run
            query["original_id"] = query["id"]
            query["id"] = query["id"] * 100 + run  # Unique ID
            all_queries.append(query)

    # Run in parallel using concurrent.futures
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = []

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = {
            executor.submit(
                run_single_query,
                query,
                skill_path,
                cli_tool,
                project_root,
                timeout,
                output_dir,
                verbose,
            ): query
            for query in all_queries
        }

        for future in as_completed(futures):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                query = futures[future]
                results.append(
                    EvalResult(
                        eval_id=query["id"],
                        prompt=query.get("prompt", ""),
                        should_trigger=query.get("should_trigger", True),
                        triggered=False,
                        passed=False,
                        evidence=f"Error: {e}",
                        duration_ms=0,
                        tokens=0,
                    )
                )

    # Aggregate results by original eval_id
    aggregated = {}
    for result in results:
        orig_id = result.eval_id // 100  # Recover original ID

        if orig_id not in aggregated:
            aggregated[orig_id] = {
                "eval_id": orig_id,
                "prompt": result.prompt,
                "should_trigger": result.should_trigger,
                "triggered": result.triggered,
                "passed": result.passed,
                "evidence": result.evidence,
                "runs": 1,
            }
        else:
            # For multiple runs, use majority vote
            agg = aggregated[orig_id]
            agg["runs"] += 1
            if result.passed:
                agg["passed"] = True  # Any pass is a pass
            agg["triggered"] = agg["triggered"] or result.triggered

    # Convert to list and calculate summary
    final_results = list(aggregated.values())

    total = len(final_results)
    passed = sum(1 for r in final_results if r["passed"])
    failed = total - passed

    summary = {
        "total": total,
        "passed": passed,
        "failed": failed,
        "pass_rate": passed / total if total > 0 else 0,
    }

    # Run grader on transcripts with expectations
    grader_results = []
    if output_dir:
        grader_dir = Path(output_dir) / "grader"
        grader_dir.mkdir(parents=True, exist_ok=True)

        for result in results:
            if result.transcript_path and result.expectations:
                # Run grader on this transcript
                grader_output = run_grader_on_transcript(
                    result.transcript_path,
                    result.expectations,
                    skill_path,
                    tier,
                    str(grader_dir),
                )
                grader_results.append(grader_output)

    return {
        "skill_name": skill_name,
        "results": final_results,
        "summary": summary,
        "grader_results": grader_results,
    }


def run_grader_on_transcript(
    transcript_path: str,
    expectations: list[str],
    skill_path: str,
    tier: int,
    output_dir: str,
) -> dict[str, Any]:
    """Run grader agent on a transcript with expectations."""

    eval_item = {
        "expectations": expectations,
    }

    cmd = [
        sys.executable,
        str(Path(__file__).parent / "run_grader.py"),
        "--transcript", transcript_path,
        "--eval-item", json.dumps(eval_item),
        "--skill-path", skill_path,
        "--tier", str(tier),
        "--output", str(Path(output_dir) / f"grading_{Path(transcript_path).stem}.json"),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            grading_path = Path(output_dir) / f"grading_{Path(transcript_path).stem}.json"
            if grading_path.exists():
                return json.loads(grading_path.read_text())
    except Exception as e:
        return {"error": str(e)}

    return {}


def main():
    parser = argparse.ArgumentParser(description="Run trigger evaluation for a skill")
    parser.add_argument("--eval-set", required=True, help="Path to evals.json")
    parser.add_argument("--skill-path", required=True, help="Path to SKILL.md")
    parser.add_argument(
        "--cli-tool",
        default="opencode",
        choices=["opencode", "claude", "codex"],
        help="CLI tool to use",
    )
    parser.add_argument(
        "--project-root",
        default=str(PROJECT_ROOT),
        help="Project root directory",
    )
    parser.add_argument("--timeout", type=int, default=120, help="Timeout per query")
    parser.add_argument(
        "--runs-per-query", type=int, default=1, help="Runs per query"
    )
    parser.add_argument(
        "--num-workers", type=int, default=4, help="Parallel workers"
    )
    parser.add_argument(
        "--tier", type=int, default=2, help="Skill tier (1, 2, or 3)"
    )
    parser.add_argument(
        "--output", help="Output JSON file (default: stdout)"
    )
    parser.add_argument("--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # Load eval set
    eval_set_path = Path(args.eval_set)
    if not eval_set_path.exists():
        print(f"Error: Eval set not found: {args.eval_set}")
        sys.exit(1)

    eval_set = json.loads(eval_set_path.read_text())

    # Determine output directory for transcripts
    output_dir = None
    if args.output:
        output_dir = str(Path(args.output).parent)
    elif args.tier >= 2:
        # Default to evals/ for tier 2+ skills
        output_dir = "evals"
        Path(output_dir).mkdir(exist_ok=True)

    # Run evaluation
    results = run_eval(
        eval_set,
        args.skill_path,
        args.cli_tool,
        Path(args.project_root),
        args.timeout,
        args.runs_per_query,
        args.num_workers,
        output_dir,
        args.tier,
        args.verbose,
    )

    # Output
    output_json = json.dumps(results, indent=2)

    if args.output:
        Path(args.output).write_text(output_json)
        print(f"Results written to: {args.output}")
    else:
        print(output_json)


if __name__ == "__main__":
    main()