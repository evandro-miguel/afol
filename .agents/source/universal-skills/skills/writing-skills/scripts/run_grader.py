#!/usr/bin/env python3
"""Run grader agent to evaluate skill execution against expectations.

Checks:
1. Did the agent read the right files?
2. Did it follow the workflow?
3. Did it produce correct output structure?
4. Did it respect progressive disclosure?
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


def load_transcript(transcript_path: str) -> str:
    """Load execution transcript."""
    path = Path(transcript_path)
    if not path.exists():
        raise FileNotFoundError(f"Transcript not found: {transcript_path}")
    return path.read_text()


def load_expectations(eval_item: dict[str, Any]) -> list[str]:
    """Extract expectations from eval item."""
    return eval_item.get("expectations", [])


def load_skill_structure(skill_path: str) -> dict[str, list[str]]:
    """Load skill file structure for tier validation."""
    skill_dir = Path(skill_path)
    if not skill_dir.exists():
        return {}

    structure = {
        "SKILL.md": (skill_dir / "SKILL.md").exists(),
        "references": [],
        "products": [],
    }

    # Check references
    refs_dir = skill_dir / "references"
    if refs_dir.exists():
        structure["references"] = [f.name for f in refs_dir.iterdir() if f.is_file()]

    # Check products (tier 3)
    products_dir = skill_dir / "products"
    if products_dir.exists():
        structure["products"] = [
            p.name for p in products_dir.iterdir() if p.is_dir()
        ]

    return structure


def detect_file_reads(transcript: str) -> list[str]:
    """Detect which files the agent read from transcript.

    Looks for patterns like:
    - Read file: path/to/file.md
    - Reading: path/to/file.md
    - I'll read path/to/file.md
    - [Read file path/to/file.md]
    """
    read_files = []

    patterns = [
        r"[Rr]ead\s+(?:file\s+)?['\"]?([^'\">\n]+\.md)['\"]?",
        r"[Rr]eading\s+(?:file\s+)?['\"]?([^'\">\n]+\.md)['\"]?",
        r"I'll\s+read\s+(?:file\s+)?['\"]?([^'\">\n]+\.md)['\"]?",
        r"\[Read\s+file\s+([^\]]+)\]",
        r"Tool: Read\s+.*?path['\"]?\s*:\s*['\"]?([^'\">\n]+)['\"]?",
    ]

    for pattern in patterns:
        matches = re.findall(pattern, transcript)
        read_files.extend(matches)

    # Normalize paths
    normalized = []
    for f in read_files:
        # Extract filename from path
        fname = f.strip().split("/")[-1]
        if fname not in normalized:
            normalized.append(fname)

    return normalized


def detect_tool_usage(transcript: str) -> list[dict[str, Any]]:
    """Detect tool usage from transcript.

    Looks for script invocations, file creation, etc.
    """
    tools_used = []

    # Script invocations
    script_patterns = [
        r"bun\s+([^\s]+\.js)",
        r"python\s+([^\s]+\.py)",
        r"npm\s+run\s+([^\s]+)",
    ]

    for pattern in script_patterns:
        matches = re.findall(pattern, transcript)
        for match in matches:
            tools_used.append({
                "type": "script",
                "name": match,
            })

    # File creation
    create_patterns = [
        r"creat(?:e|ing|ed)\s+(?:file\s+)?['\"]?([^'\">\n]+\.md)['\"]?",
        r"[Ww]rit(?:e|ing|ten)\s+(?:to\s+)?['\"]?([^'\">\n]+\.md)['\"]?",
    ]

    for pattern in create_patterns:
        matches = re.findall(pattern, transcript)
        for match in matches:
            tools_used.append({
                "type": "file_create",
                "name": match,
            })

    return tools_used


def check_progressive_disclosure(
    reads: list[str],
    tier: int,
    expectations: list[str],
) -> dict[str, Any]:
    """Check if agent respected progressive disclosure.

    Tier 1: Should read only SKILL.md
    Tier 2: Should read SKILL.md + specific references if needed
    Tier 3: Should read SKILL.md + product-specific files
    """
    result = {
        "respected": True,
        "issues": [],
        "read_count": len(reads),
    }

    # Check for over-reading (reading everything at once)
    if len(reads) > 10:
        result["respected"] = False
        result["issues"].append(
            f"Agent read {len(reads)} files at once - should use progressive disclosure"
        )

    # Tier-specific checks
    if tier == 1:
        # Should only read SKILL.md
        non_skill_reads = [r for r in reads if r != "SKILL.md" and not r.startswith("examples")]
        if non_skill_reads:
            result["respected"] = False
            result["issues"].append(
                f"Tier 1 skill: Agent read unnecessary files: {non_skill_reads}"
            )

    elif tier == 2:
        # Should read SKILL.md first, then references on demand
        if "SKILL.md" not in reads and len(reads) > 0:
            result["respected"] = False
            result["issues"].append("Agent didn't read SKILL.md first")

    elif tier == 3:
        # Should read SKILL.md, then product-specific files
        if "SKILL.md" not in reads and len(reads) > 0:
            result["respected"] = False
            result["issues"].append("Agent didn't read SKILL.md first")

    return result


def evaluate_expectation(
    expectation: str,
    transcript: str,
    reads: list[str],
    tools: list[dict[str, Any]],
    skill_structure: dict[str, Any],
) -> dict[str, Any]:
    """Evaluate a single expectation against transcript."""

    expectation_lower = expectation.lower()
    result = {
        "text": expectation,
        "passed": False,
        "evidence": "",
        "category": "other",
    }

    # Category: File reading
    if "read" in expectation_lower and ("file" in expectation_lower or "reference" in expectation_lower):
        result["category"] = "file_reading"

        # Check if expected file was read
        if "standards" in expectation_lower:
            if any("standards" in r.lower() for r in reads):
                result["passed"] = True
                result["evidence"] = f"Agent read standards files: {[r for r in reads if 'standards' in r.lower()]}"
            else:
                result["evidence"] = "Agent did not read standards files"

        elif "templates" in expectation_lower:
            if any("templates" in r.lower() for r in reads):
                result["passed"] = True
                result["evidence"] = f"Agent read templates files"
            else:
                result["evidence"] = "Agent did not read templates files"

        elif "cso" in expectation_lower or "discovery" in expectation_lower:
            if any("cso" in r.lower() for r in reads):
                result["passed"] = True
                result["evidence"] = "Agent read CSO reference"
            else:
                result["evidence"] = "Agent did not read CSO reference"

    # Category: Workflow following
    elif "workflow" in expectation_lower or "step" in expectation_lower:
        result["category"] = "workflow"

        # Check for numbered steps or workflow keywords
        if re.search(r"step\s*\d+|first|then|next|finally", transcript.lower()):
            result["passed"] = True
            result["evidence"] = "Agent followed step-by-step workflow"
        else:
            result["evidence"] = "No clear workflow steps detected"

    # Category: Script usage
    elif "script" in expectation_lower or "bun" in expectation_lower or "create-skill" in expectation_lower:
        result["category"] = "script_usage"

        if tools:
            script_tools = [t for t in tools if t.get("type") == "script"]
            if script_tools:
                result["passed"] = True
                result["evidence"] = f"Agent used scripts: {[t['name'] for t in script_tools]}"
            else:
                result["evidence"] = "No script usage detected"
        else:
            result["evidence"] = "No tool usage detected in transcript"

    # Category: Output structure
    elif "structure" in expectation_lower or "tier" in expectation_lower or "output" in expectation_lower:
        result["category"] = "output_structure"

        # Check for expected file creation
        file_creates = [t for t in tools if t.get("type") == "file_create"]
        if file_creates:
            result["passed"] = True
            result["evidence"] = f"Created files: {[t['name'] for t in file_creates]}"
        else:
            result["evidence"] = "No file creation detected"

    # Category: Progressive disclosure
    elif "progressive" in expectation_lower or "disclosure" in expectation_lower:
        result["category"] = "progressive_disclosure"
        # This is evaluated separately
        result["evidence"] = "Evaluated via progressive_disclosure check"

    # Category: General text match
    else:
        # Try to find expectation keywords in transcript
        keywords = [w for w in expectation.split() if len(w) > 4]
        matches = sum(1 for kw in keywords if kw.lower() in transcript.lower())

        if matches >= len(keywords) * 0.5:
            result["passed"] = True
            result["evidence"] = f"Found {matches}/{len(keywords)} keywords in transcript"
        else:
            result["evidence"] = f"Only found {matches}/{len(keywords)} keywords"

    return result


def run_grader(
    transcript_path: str,
    eval_item: dict[str, Any],
    skill_path: str,
    tier: int = 2,
) -> dict[str, Any]:
    """Run full grader evaluation."""

    # Load inputs
    transcript = load_transcript(transcript_path)
    expectations = load_expectations(eval_item)
    skill_structure = load_skill_structure(skill_path)

    # Detect what agent did
    reads = detect_file_reads(transcript)
    tools = detect_tool_usage(transcript)

    # Check progressive disclosure
    pd_check = check_progressive_disclosure(reads, tier, expectations)

    # Evaluate each expectation
    results = []
    for exp in expectations:
        result = evaluate_expectation(exp, transcript, reads, tools, skill_structure)
        results.append(result)

    # Calculate summary
    passed = sum(1 for r in results if r["passed"])
    total = len(results)

    # Add progressive disclosure as a meta-expectation
    if not pd_check["respected"]:
        results.append({
            "text": "Agent respected progressive disclosure",
            "passed": False,
            "evidence": "; ".join(pd_check["issues"]),
            "category": "progressive_disclosure",
        })
        total += 1
    else:
        results.append({
            "text": "Agent respected progressive disclosure",
            "passed": True,
            "evidence": f"Read {len(reads)} files appropriately",
            "category": "progressive_disclosure",
        })
        passed += 1

    return {
        "expectations": results,
        "summary": {
            "passed": passed,
            "failed": total - passed,
            "total": total,
            "pass_rate": passed / total if total > 0 else 0,
        },
        "file_reads": reads,
        "tools_used": tools,
        "progressive_disclosure": pd_check,
        "tier": tier,
    }


def main():
    parser = argparse.ArgumentParser(description="Grade skill execution against expectations")
    parser.add_argument(
        "--transcript", required=True, help="Path to execution transcript"
    )
    parser.add_argument(
        "--eval-item", required=True, help="Path to eval item JSON or inline JSON"
    )
    parser.add_argument(
        "--skill-path", required=True, help="Path to skill directory"
    )
    parser.add_argument(
        "--tier", type=int, default=2, help="Skill tier (1, 2, or 3)"
    )
    parser.add_argument(
        "--output", help="Output JSON file (default: stdout)"
    )

    args = parser.parse_args()

    # Load eval item
    eval_path = Path(args.eval_item)
    if eval_path.exists():
        eval_item = json.loads(eval_path.read_text())
    else:
        # Try to parse as inline JSON
        try:
            eval_item = json.loads(args.eval_item)
        except json.JSONDecodeError:
            print(f"Error: Cannot parse eval item: {args.eval_item}")
            sys.exit(1)

    # Run grader
    grading = run_grader(args.transcript, eval_item, args.skill_path, args.tier)

    # Output
    output_json = json.dumps(grading, indent=2)

    if args.output:
        Path(args.output).write_text(output_json)
        print(f"Grading written to: {args.output}")
    else:
        print(output_json)


if __name__ == "__main__":
    main()