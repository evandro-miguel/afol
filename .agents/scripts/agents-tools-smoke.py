#!/usr/bin/env python3
"""Smoke tests for .agents tools discovery CLI."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import List, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
WRAPPER = ROOT_DIR / ".agents" / "agents"


Case = Tuple[List[str], int, List[str]]


def run_case(case: Case) -> tuple[bool, str]:
    cmd, expected_code, expected_tokens = case
    result = subprocess.run(
        cmd,
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
    )
    output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")

    if result.returncode != expected_code:
        return False, f"{cmd} expected exit {expected_code}, got {result.returncode}\n{output}"

    missing = [tok for tok in expected_tokens if tok not in output]
    if missing:
        return False, f"{cmd} missing tokens: {missing}\n{output}"

    return True, ""


def main() -> int:
    if not WRAPPER.exists():
        print(f"❌ wrapper not found: {WRAPPER}")
        return 1

    cases: List[Case] = [
        ([str(WRAPPER), "tools", "list"], 0, ["AGENTS TOOLS - Available Tools", "wb-update"]),
        ([str(WRAPPER), "tools", "list", "--type", "validation"], 0, ["doctor", "lint-docs"]),
        ([str(WRAPPER), "tools", "info", "doctor"], 0, ["TOOL: Agents Doctor", "CHECKS"]),
        ([str(WRAPPER), "tools", "info", "benchmark"], 0, ["TOOL: Agents Runtime Flow Benchmark", "benchmark run"]),
        ([str(WRAPPER), "tools", "info", "wb-update"], 0, ["SUBCOMMANDS", "normalize-time"]),
        ([str(WRAPPER), "tools", "search", "automate"], 0, ["wb-update"]),
        ([str(WRAPPER), "tools", "validate"], 0, ["Catalog Validation", "Catalog is valid"]),
        ([str(WRAPPER), "tools", "help"], 0, ["AGENTS TOOLS - Help", "validate"]),
        ([str(WRAPPER), "tools", "info", "missing-tool"], 1, ["Tool not found"]),
        ([str(WRAPPER), "tools", "list", "--type", "not-a-type"], 1, ["Unknown type"]),
    ]

    failures: List[str] = []
    for case in cases:
        ok, message = run_case(case)
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {' '.join(case[0][2:])}")
        if not ok:
            failures.append(message)

    if failures:
        print("\n❌ tools smoke failed")
        for failure in failures:
            print("-" * 60)
            print(failure)
        return 1

    print("\n✅ tools smoke passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
