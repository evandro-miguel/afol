#!/usr/bin/env python3
"""Review command for governed execution states."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple

from lib.execution_commands import (
    build_session_catchup,
    find_session,
    parse_task_rows,
    split_frontmatter,
)
from lib.agents_config import load_agents_config

ROOT_DIR, _CONFIG = load_agents_config(Path(__file__).resolve().parent)


def _append_issue(findings: List[Dict[str, str]], scope: str, severity: str, message: str) -> None:
    findings.append({"scope": scope, "severity": severity, "message": message})


def run_verify_tasks(session_dir: Path) -> Tuple[int, str, str]:
    proc = subprocess.run(
        [sys.executable, str(ROOT_DIR / ".agents/scripts/verify-tasks.py"), str(session_dir)],
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout, proc.stderr


def inspect_artifacts(session_dir: Path) -> List[Dict[str, str]]:
    findings: List[Dict[str, str]] = []

    plan_candidates = sorted(session_dir.glob("*_plan_*.md"))
    task_candidates = sorted(session_dir.glob("*_task_*.md"))
    spec_candidates = sorted(session_dir.glob("*_spec*.md"))
    report_candidates = sorted(session_dir.glob("*_report_*.md"))

    if not plan_candidates:
        _append_issue(findings, "plan", "error", "No plan artifact found")
        return findings

    plan_fm, _ = split_frontmatter(plan_candidates[-1].read_text(encoding="utf-8"))
    if not plan_fm:
        _append_issue(findings, "plan", "error", "Plan file missing frontmatter")

    if not task_candidates:
        _append_issue(findings, "task", "error", "No task artifact found")
    else:
        task_fm, _ = split_frontmatter(task_candidates[-1].read_text(encoding="utf-8"))
        if str(task_fm.get("roadmap_feature", "")).strip() != str(plan_fm.get("roadmap_feature", "")).strip():
            _append_issue(findings, "task", "error", "task.roadmap_feature does not match plan")
        links = task_fm.get("links", {})
        if not isinstance(links, dict) or links.get("plan") != plan_fm.get("id", ""):
            _append_issue(findings, "task", "warning", "Task plan link missing or mismatch")

    if not spec_candidates:
        _append_issue(findings, "spec", "info", "No spec artifact found; implementation guidance may be incomplete")

    if not report_candidates:
        _append_issue(findings, "report", "warning", "No report artifact found")

    if task_candidates:
        rows = parse_task_rows(task_candidates[-1])
        if not rows:
            _append_issue(findings, "task", "warning", "Task file exists but no parsed task rows")
        blocked = [r for r in rows if r.state == "blocked"]
        if blocked:
            _append_issue(findings, "task", "warning", f"Blocked tasks present: {', '.join(r.task_id for r in blocked)}")

    catchup = build_session_catchup(session_dir, paths_limit=5)
    if catchup["warnings"]:
        _append_issue(findings, "verify", "warning", f"Session catchup advised: {catchup['warnings'][0]}")
    if catchup["stale_artifacts"]:
        _append_issue(
            findings,
            "verify",
            "warning",
            f"Stale session artifacts: {', '.join(catchup['stale_artifacts'])}",
        )

    return findings


def cmd_scope(session_dir: Path, scope: str) -> int:
    findings = inspect_artifacts(session_dir)
    code, out, err = run_verify_tasks(session_dir)

    if code == 0:
        _append_issue(findings, "verify", "info", "verify-tasks checks passed")
    else:
        _append_issue(findings, "verify", "error", "verify-tasks reports failures")
        _append_issue(findings, "task", "error", "Task verification reports failures")

    if scope != "all":
        findings = [finding for finding in findings if finding["scope"] == scope]

    total = len(findings)
    error_count = sum(1 for finding in findings if finding["severity"] == "error")
    print(f"scope={scope} session={session_dir.name} issues={total}")
    for severity in ("error", "warning", "info"):
        for finding in findings:
            if finding["severity"] == severity:
                print(f"[{severity.upper()}][{finding['scope']}]: {finding['message']}")

    if out and scope in {"all", "verify", "task"}:
        print("\n--- verify-tasks output ---")
        print(out.strip())
    if err:
        print("--- verify-tasks stderr ---")
        print(err.strip())

    return 0 if error_count == 0 else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Review a session against plan/spec/task/workflow constraints")
    p.add_argument("--session", help="Session id/path (default: active session)")
    p.add_argument("--scope", choices=["all", "plan", "task", "spec", "report", "verify"], default="all")
    return p


def main() -> int:
    args = build_parser().parse_args()
    try:
        session_dir = find_session(args.session)
        return cmd_scope(session_dir, args.scope)
    except Exception as exc:
        print(f"❌ {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
