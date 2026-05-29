#!/usr/bin/env python3
"""Controlled live-agent runtime-flow benchmarks for scaffold execution paths."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from lib.cli_output import to_json_text


ROOT_DIR = Path(__file__).resolve().parent.parent.parent
AGENTS_DIR = ROOT_DIR / ".agents"
DOCS_DIR = ROOT_DIR / "docs"
RESULTS_DIR = AGENTS_DIR / "data" / "benchmarks" / "results"
BENCHMARK_SNAPSHOT_DIR = AGENTS_DIR / "benchmarks"
CURRENT_RESULTS_FILE = BENCHMARK_SNAPSHOT_DIR / "current-results.json"

FIXTURE_WORKSTREAM_ID = "260423_0001_runtime-flow-live-agent-fixture"
FIXTURE_FEATURE_ID = "F-19"
FIXTURE_PARENT_SPEC_ID = "260423_1605_controlled-runtime-flow-benchmarks_spec_01"
FIXTURE_CHILD_SPEC_ID = "260423_2120_runtime-flow-benchmark-scenarios_spec-child_01"
FIXTURE_PARENT_SPEC_FILE = (
    DOCS_DIR / "arc" / "SPECS" / "260423_1605_controlled-runtime-flow-benchmarks_spec_01.md"
)
FIXTURE_CHILD_SPEC_FILE = (
    DOCS_DIR / "arc" / "SPECS" / "260423_2120_runtime-flow-benchmark-scenarios_spec-child_01.md"
)
BENCHMARK_PACK_ID = "runtime-flow-live-agent-v4"
LIVE_COMPLETE_COMMAND = "live benchmark fixture command"
EXIT_CODE_RE = re.compile(r"Process exited with code\s+(-?\d+)")
COMPARISON_METRICS: tuple[tuple[str, str, bool], ...] = (
    ("duration_ms", "lower", False),
    ("tool_call_count", "lower", False),
    ("tool_success_rate", "higher", True),
    ("error_count", "lower", False),
    ("accuracy", "higher", True),
    ("context_bytes_total", "lower", False),
    ("prompt_bytes_total", "lower", False),
)


@dataclass(frozen=True)
class BenchmarkProfile:
    runtime: str = "codex"
    model: str = "gpt-5.4-mini"
    reasoning_effort: str = "medium"

    def to_dict(self) -> dict[str, str]:
        return {
            "runtime": self.runtime,
            "model": self.model,
            "reasoning_effort": self.reasoning_effort,
        }


@dataclass(frozen=True)
class LiveBenchmarkScenario:
    id: str
    description: str
    purpose: str
    tool_families: tuple[str, ...]
    scope: str
    context_artifacts: tuple[str, ...]
    required_command_substrings: tuple[str, ...]
    response_schema: dict[str, Any]
    prompt: str
    validator: Callable[[dict[str, Any], Path], list[str]]
    validation_check_count: int
    any_required_command_groups: tuple[tuple[str, ...], ...] = ()
    min_tool_calls: int = 1
    timeout_seconds: int = 240
    forbidden_command_substrings: tuple[str, ...] = ()


DEFAULT_PROFILE = BenchmarkProfile()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _timestamp_slug() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _excerpt(text: str, limit: int = 220) -> str:
    compact = " ".join(text.strip().split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 3] + "..."


def _copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def _copy_tree(src: Path, dst: Path, ignore: Any = None) -> None:
    shutil.copytree(src, dst, dirs_exist_ok=True, ignore=ignore)


def _link_fixture_venv(temp_root: Path) -> None:
    source_venv = AGENTS_DIR / "scripts" / ".venv"
    target_venv = temp_root / ".agents" / "scripts" / ".venv"
    if not source_venv.exists() or target_venv.exists():
        return
    try:
        target_venv.symlink_to(source_venv, target_is_directory=True)
    except OSError:
        return


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _json_size(data: str) -> int:
    return len(data.encode("utf-8"))


def _relative_from_root(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT_DIR))
    except ValueError:
        return str(path)


def _safe_division(numerator: int, denominator: int, *, digits: int = 4) -> float:
    if denominator <= 0:
        return 0.0
    return round(numerator / denominator, digits)


def _efficiency_metrics(payload: dict[str, Any]) -> dict[str, float]:
    duration_ms = int(payload.get("duration_ms", 0))
    scenario_count = int(payload.get("scenario_count", 0))
    checks_total = int(payload.get("checks_total", 0))
    tool_call_count = int(payload.get("tool_call_count", 0))
    total_bytes = int(payload.get("context_bytes_total", 0)) + int(payload.get("prompt_bytes_total", 0))
    duration_seconds = _safe_division(duration_ms, 1000, digits=6)

    checks_per_second = 0.0
    tool_calls_per_second = 0.0
    bytes_per_second = 0.0
    if duration_seconds > 0:
        checks_per_second = round(checks_total / duration_seconds, 4)
        tool_calls_per_second = round(tool_call_count / duration_seconds, 4)
        bytes_per_second = round(total_bytes / duration_seconds, 4)

    return {
        "duration_ms_per_scenario": _safe_division(duration_ms, scenario_count, digits=2),
        "checks_per_second": checks_per_second,
        "tool_calls_per_second": tool_calls_per_second,
        "bytes_per_second": bytes_per_second,
        "bytes_per_tool_call": _safe_division(total_bytes, tool_call_count, digits=2),
    }


def _stable_pack_filename(pack_id: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", str(pack_id)).strip("-")
    if not slug:
        slug = "benchmark-pack"
    return f"{slug}-latest.json"


def _snapshot_scenario_ids(scenarios: list[dict[str, Any]]) -> list[str]:
    scenario_ids: list[str] = []
    for scenario in scenarios:
        scenario_id = scenario.get("id")
        if scenario_id is None:
            continue
        scenario_ids.append(str(scenario_id))
    return sorted(scenario_ids)


def _read_snapshot(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        decoded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(decoded, dict):
        return None
    return decoded


def _metric_value(value: Any, *, as_float: bool) -> int | float:
    if as_float:
        return float(value or 0.0)
    return int(value or 0)


def _metric_delta(current: int | float, previous: int | float, *, as_float: bool) -> int | float:
    delta = current - previous
    if as_float:
        return round(float(delta), 4)
    return int(delta)


def _metric_delta_pct(delta: int | float, previous: int | float) -> float | None:
    if previous == 0:
        return 0.0 if delta == 0 else None
    return round((float(delta) / abs(float(previous))) * 100, 2)


def _metric_trend(delta: int | float, direction: str) -> str:
    if delta == 0:
        return "unchanged"
    if direction == "lower":
        return "improved" if delta < 0 else "regressed"
    return "improved" if delta > 0 else "regressed"


def _build_previous_comparison(
    summary: dict[str, Any],
    scenario_ids: list[str],
    previous_snapshot: dict[str, Any] | None,
) -> dict[str, Any]:
    comparison: dict[str, Any] = {
        "status": "unavailable",
        "reason": "no_previous_saved_snapshot",
        "baseline_saved_result_path": None,
        "baseline_generated_at": None,
        "scenario_ids": scenario_ids,
        "baseline_scenario_ids": [],
        "delta": {},
        "delta_pct": {},
        "trend": {},
    }
    if previous_snapshot is None:
        return comparison

    previous_scenarios = previous_snapshot.get("scenarios")
    previous_scenario_ids = (
        _snapshot_scenario_ids(previous_scenarios)
        if isinstance(previous_scenarios, list)
        else []
    )
    comparison["baseline_saved_result_path"] = previous_snapshot.get("saved_result_path")
    comparison["baseline_generated_at"] = previous_snapshot.get("generated_at")
    comparison["baseline_scenario_ids"] = previous_scenario_ids

    previous_summary = previous_snapshot.get("summary")
    if not isinstance(previous_summary, dict):
        comparison["reason"] = "invalid_previous_snapshot"
        return comparison
    if scenario_ids != previous_scenario_ids:
        comparison["status"] = "not_comparable"
        comparison["reason"] = "scenario_set_mismatch"
        return comparison

    for metric, direction, as_float in COMPARISON_METRICS:
        current_value = _metric_value(summary.get(metric), as_float=as_float)
        previous_value = _metric_value(previous_summary.get(metric), as_float=as_float)
        delta = _metric_delta(current_value, previous_value, as_float=as_float)
        comparison["delta"][metric] = delta
        comparison["delta_pct"][metric] = _metric_delta_pct(delta, previous_value)
        comparison["trend"][metric] = _metric_trend(delta, direction)

    comparison["status"] = "comparable"
    comparison["reason"] = "same_pack_and_scenarios"
    return comparison


def _build_stable_snapshot(
    payload: dict[str, Any],
    saved_path: Path,
    previous_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    scenarios: list[dict[str, Any]] = []
    for scenario in payload.get("scenarios", []):
        if not isinstance(scenario, dict):
            continue
        scenarios.append(
            {
                "id": scenario.get("id"),
                "pass": bool(scenario.get("pass")),
                "duration_ms": int(scenario.get("duration_ms", 0)),
                "tool_call_count": int(scenario.get("tool_call_count", 0)),
                "checks_total": int(scenario.get("checks_total", 0)),
                "checks_passed": int(scenario.get("checks_passed", 0)),
                "error_count": int(scenario.get("error_count", 0)),
                "retry_count": int(scenario.get("retry_count", 0)),
            }
        )

    summary = {
        "pass": bool(payload.get("pass")),
        "scenario_count": int(payload.get("scenario_count", 0)),
        "duration_ms": int(payload.get("duration_ms", 0)),
        "tool_call_count": int(payload.get("tool_call_count", 0)),
        "tool_success_count": int(payload.get("tool_success_count", 0)),
        "tool_success_rate": float(payload.get("tool_success_rate", 0.0)),
        "checks_total": int(payload.get("checks_total", 0)),
        "checks_passed": int(payload.get("checks_passed", 0)),
        "accuracy": float(payload.get("accuracy", 0.0)),
        "error_count": int(payload.get("error_count", 0)),
        "retry_count": int(payload.get("retry_count", 0)),
        "context_bytes_total": int(payload.get("context_bytes_total", 0)),
        "prompt_bytes_total": int(payload.get("prompt_bytes_total", 0)),
    }
    scenario_ids = _snapshot_scenario_ids(scenarios)

    return {
        "version": 1,
        "updated_at": _utc_now(),
        "pack_id": str(payload.get("pack_id", BENCHMARK_PACK_ID)),
        "generated_at": payload.get("generated_at"),
        "saved_result_path": _relative_from_root(saved_path),
        "benchmark_profile": payload.get("benchmark_profile", {}),
        "summary": summary,
        "comparison_to_previous": _build_previous_comparison(
            summary, scenario_ids, previous_snapshot
        ),
        "efficiency": _efficiency_metrics(payload),
        "scenarios": scenarios,
    }


def _write_stable_snapshots(payload: dict[str, Any], saved_path: Path) -> None:
    BENCHMARK_SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    pack_file = BENCHMARK_SNAPSHOT_DIR / _stable_pack_filename(
        str(payload.get("pack_id", BENCHMARK_PACK_ID))
    )
    previous_snapshot = _read_snapshot(pack_file)
    snapshot = _build_stable_snapshot(payload, saved_path, previous_snapshot)
    encoded = json.dumps(snapshot, indent=2) + "\n"
    CURRENT_RESULTS_FILE.write_text(encoded, encoding="utf-8")
    pack_file.write_text(encoded, encoding="utf-8")


def _fixture_plan_text() -> str:
    return (
        "---\n"
        "doc_type: plan\n"
        f"id: {FIXTURE_WORKSTREAM_ID}_plan_01\n"
        "theme: runtime-flow-live-agent-fixture\n"
        "status: active\n"
        "owners:\n"
        "- orchestrator\n"
        "workstream_intent: delivery\n"
        "artifact_purpose: Controlled live benchmark fixture plan.\n"
        "created_at: '2026-04-23T20:06:00-03:00'\n"
        "updated_at: '2026-04-23T20:06:00-03:00'\n"
        f"roadmap_feature: {FIXTURE_FEATURE_ID}\n"
        f"parent_spec: {FIXTURE_PARENT_SPEC_ID}\n"
        f"child_spec: {FIXTURE_CHILD_SPEC_ID}\n"
        "links:\n"
        "  roadmap: docs/arc/GENERAL-ROADMAP.md\n"
        f"  task: {FIXTURE_WORKSTREAM_ID}_task_01\n"
        "---\n\n"
        "# Plan\n\n"
        "## Progress\n"
        "- [x] 2026-04-23 20:06-03 - Fixture created for controlled live benchmark execution.\n\n"
        "## Concrete Steps\n"
        "1. Run governed preflight through the live agent.\n"
        "2. Run start/complete and verify evidence.\n"
        "3. Run wb-update task, timeline, status, touch, and link flows.\n\n"
        "## Validation and Acceptance\n"
        "- The live benchmark command must observe tool usage and pass the bounded scenarios.\n"
    )


def _fixture_task_text() -> str:
    return (
        "---\n"
        "doc_type: task\n"
        f"id: {FIXTURE_WORKSTREAM_ID}_task_01\n"
        "theme: runtime-flow-live-agent-fixture\n"
        "status: active\n"
        "owners:\n"
        "- worker\n"
        "workstream_intent: delivery\n"
        "artifact_purpose: Controlled live benchmark fixture task board.\n"
        "created_at: '2026-04-23T20:06:00-03:00'\n"
        "updated_at: '2026-04-23T20:06:00-03:00'\n"
        f"roadmap_feature: {FIXTURE_FEATURE_ID}\n"
        f"parent_spec: {FIXTURE_PARENT_SPEC_ID}\n"
        f"child_spec: {FIXTURE_CHILD_SPEC_ID}\n"
        "depends_on:\n"
        f"- {FIXTURE_WORKSTREAM_ID}_plan_01\n"
        "links:\n"
        f"  plan: {FIXTURE_WORKSTREAM_ID}_plan_01\n"
        "  roadmap: docs/arc/GENERAL-ROADMAP.md\n"
        "---\n\n"
        "# Tasks\n\n"
        "| ID | status | owner | description |\n"
        "| --- | --- | --- | --- |\n"
        "| T-01 | pending | worker | Run the controlled live benchmark fixture flow. |\n\n"
        "| T-02 | pending | worker | Mark task progress through wb-update evidence and task commands. |\n\n"
        "| T-03 | pending | worker | Update report status and timestamps through wb-update scripts. |\n\n"
        "| T-04 | pending | worker | Update report links through wb-update link. |\n\n"
        "## Notes\n\n"
        "- Record live benchmark evidence through `implement complete`.\n"
    )


def _fixture_log_text() -> str:
    return (
        "---\n"
        "doc_type: log\n"
        f"id: {FIXTURE_WORKSTREAM_ID}_log_01\n"
        "theme: runtime-flow-live-agent-fixture\n"
        "status: active\n"
        "owners:\n"
        "- worker\n"
        "workstream_intent: delivery\n"
        "artifact_purpose: Controlled live benchmark fixture log.\n"
        "created_at: '2026-04-23T20:06:00-03:00'\n"
        "updated_at: '2026-04-23T20:06:00-03:00'\n"
        f"roadmap_feature: {FIXTURE_FEATURE_ID}\n"
        f"parent_spec: {FIXTURE_PARENT_SPEC_ID}\n"
        f"child_spec: {FIXTURE_CHILD_SPEC_ID}\n"
        "links:\n"
        f"  plan: {FIXTURE_WORKSTREAM_ID}_plan_01\n"
        f"  task: {FIXTURE_WORKSTREAM_ID}_task_01\n"
        "---\n\n"
        "# Log\n\n"
        "## Timeline\n\n"
        "- 2026-04-23 20:06-03 - Fixture initialized for live benchmark execution.\n"
    )


def _fixture_report_text() -> str:
    return (
        "---\n"
        "doc_type: report\n"
        f"id: {FIXTURE_WORKSTREAM_ID}_report_01\n"
        "theme: runtime-flow-live-agent-fixture\n"
        "status: active\n"
        "owners:\n"
        "- worker\n"
        "workstream_intent: delivery\n"
        "artifact_purpose: Controlled live benchmark fixture report.\n"
        "created_at: '2026-04-23T20:06:00-03:00'\n"
        "updated_at: '2026-04-23T20:06:00-03:00'\n"
        f"roadmap_feature: {FIXTURE_FEATURE_ID}\n"
        f"parent_spec: {FIXTURE_PARENT_SPEC_ID}\n"
        f"child_spec: {FIXTURE_CHILD_SPEC_ID}\n"
        "links:\n"
        "  roadmap: docs/arc/GENERAL-ROADMAP.md\n"
        "  postmortem: ''\n"
        "---\n\n"
        "# Report\n\n"
        "## Summary\n\n"
        "- Fixture report for controlled live benchmark execution.\n\n"
        "## Files Changed\n\n"
        "- none yet\n"
    )


def _fixture_spec_text(spec_id: str, title: str, doc_type: str) -> str:
    return (
        "---\n"
        f"doc_type: {doc_type}\n"
        f"id: {spec_id}\n"
        "theme: runtime-flow-benchmark-fixture\n"
        "status: active\n"
        "owners:\n"
        "- orchestrator\n"
        "workstream_intent: feature\n"
        "artifact_purpose: Minimal benchmark fixture governance document.\n"
        "created_at: '2026-04-23T20:06:00-03:00'\n"
        "updated_at: '2026-04-23T20:06:00-03:00'\n"
        f"roadmap_feature: {FIXTURE_FEATURE_ID}\n"
        "---\n\n"
        f"# {title}\n\n"
        "This fixture document exists so exported project templates can run the live benchmark pack.\n"
    )


def _fixture_roadmap_text() -> str:
    return (
        "# General Roadmap\n\n"
        f"### {FIXTURE_FEATURE_ID} Controlled Runtime Flow Benchmarks\n\n"
        f"- Parent spec: `docs/arc/SPECS/{FIXTURE_PARENT_SPEC_FILE.name}`\n"
        "- Purpose: fixture roadmap entry for live benchmark execution.\n"
    )


def _fixture_agents_text() -> str:
    return (
        "# AGENTS.md\n\n"
        "## Governed Execution Trigger\n\n"
        "When the request requires implementation, validation, or delivery and references governed work, "
        "workbench state, evidence, or task completion, the `.agents/wb/` workflow is part of the work.\n\n"
        "Use the scaffold wrapper as the source of truth:\n\n"
        "1. `./.agents/agents new <theme> --feature-id <F-id> --parent-spec <spec-id> --child-spec <spec-id>` creates the governed session.\n"
        "2. `./.agents/agents implement start --session <session-id> --task-id T-01` begins the executable task before product edits.\n"
        "3. Edit the product and run the acceptance check named by the request.\n"
        "4. `./.agents/agents implement complete --session <session-id> --task-id T-01 --command \"<verification command>\" --result passed --artifact <path-or-report>` records evidence and marks the task done.\n\n"
        "Do not reuse fixture sessions for new delivery work. Do not create tasks already marked `[x]`. "
        "Do not manually edit `.agents/wb` task state or `.evidence.jsonl`.\n\n"
        "## Task State Markers\n\n"
        "- `[ ]` pending\n"
        "- `[/]` in_progress\n"
        "- `[!]` problem\n"
        "- `[>]` moved\n"
        "- `[%]` implemented_untested\n"
        "- `[&]` tested_needs_spec_validation\n"
        "- `[x]` done only after task-scoped closure evidence exists\n"
    )


def _hypothetical_problem_text() -> str:
    return (
        "# Hypothetical Delivery Request\n\n"
        "The repository contains a tiny runtime policy fixture. The current policy still describes a manual workflow, "
        "but this project should describe an agentic-folder governed workflow.\n\n"
        "## Acceptance\n\n"
        "- `python scripts/check_runtime_policy.py` must pass.\n"
        "- Keep the change minimal.\n"
        "- Use the repository's normal governed operational workflow for planning, execution tracking, evidence, and final verification.\n"
        "- Treat `scripts/check_runtime_policy.py` as an immutable acceptance gate, not product code for this request.\n"
        "- The existing fixture session is context only and does not satisfy this delivery request.\n\n"
        "## Operational Order\n\n"
        "- For governed work, create or target the `.agents/wb/` session before editing product files.\n"
        "- Move the relevant task into progress before the product edit.\n"
        "- After validation passes, record evidence and close the task with the returned evidence id.\n\n"
        "## Workflow Discovery Pointers\n\n"
        "- The raw tool catalog stores entries in the top-level `tools` array.\n"
        "- The relevant tool contracts are `new`, `wb-update`, and `implement` if you choose the guided execution path.\n"
        "- Distinguish linking an existing child spec from creating a local lightweight spec artifact.\n"
        "- Do not invent similarly named flags when the wrapper catalog already names the supported option.\n"
        "- For scripted completion, register evidence first and then mark the task done with the returned evidence id.\n\n"
        "## Governance Context\n\n"
        f"- Roadmap feature: `{FIXTURE_FEATURE_ID}`\n"
        f"- Parent spec: `{FIXTURE_PARENT_SPEC_ID}`\n"
        f"- Child spec: `{FIXTURE_CHILD_SPEC_ID}`\n"
    )


def _runtime_policy_text() -> str:
    return (
        "{\n"
        '  "workflow_mode": "manual",\n'
        '  "default_execution": "ad_hoc",\n'
        '  "evidence_required": false\n'
        "}\n"
    )


def _runtime_policy_check_text() -> str:
    return (
        "#!/usr/bin/env python3\n"
        '"""Validate the tiny benchmark runtime policy fixture.\n\n'
        "This is an immutable acceptance gate for the benchmark request. It is\n"
        "not product code for this task.\n"
        '"""\n\n'
        "from __future__ import annotations\n\n"
        "import json\n"
        "import re\n"
        "from pathlib import Path\n\n"
        'POLICY_PATH = Path("app/runtime_policy.json")\n'
        "SCRIPT_REPO_ROOT = Path(__file__).resolve().parents[1]\n"
        f'FIXTURE_SESSION_ID = "{FIXTURE_WORKSTREAM_ID}"\n'
        'WB_DIR = Path(".agents/wb")\n'
        'TASK_TABLE_RE = re.compile(r"^\\|\\s*(T-\\d{2,3})\\s*\\|\\s*([^|]+?)\\s*\\|")\n'
        'TASK_CHECK_RE = re.compile(r"^-\\s*\\[([ /%!>&x])\\]\\s+(T-\\d{2,3})\\b")\n'
        "MARKER_TO_STATE = {\n"
        '    " ": "pending",\n'
        '    "/": "in_progress",\n'
        '    "%": "implemented_untested",\n'
        '    "&": "tested_needs_spec_validation",\n'
        '    "!": "problem",\n'
        '    ">": "moved",\n'
        '    "x": "done",\n'
        "}\n"
        'STARTED_STATES = {"in_progress", "implemented_untested", "tested_needs_spec_validation", "done"}\n\n\n'
        "def _task_state(task_file: Path, task_id: str = \"T-01\") -> str | None:\n"
        "    for raw_line in task_file.read_text(encoding=\"utf-8\").splitlines():\n"
        "        line = raw_line.strip()\n"
        "        table = TASK_TABLE_RE.match(line)\n"
        "        if table and table.group(1) == task_id:\n"
        "            return table.group(2).strip().lower()\n"
        "        check = TASK_CHECK_RE.match(line)\n"
        "        if check and check.group(2) == task_id:\n"
        "            return MARKER_TO_STATE.get(check.group(1))\n"
        "    return None\n\n\n"
        "def _governed_session_started() -> bool:\n"
        "    if not WB_DIR.exists():\n"
        "        return False\n"
        "    for session_dir in WB_DIR.iterdir():\n"
        "        if not session_dir.is_dir() or session_dir.name == FIXTURE_SESSION_ID:\n"
        "            continue\n"
        "        has_plan = any(session_dir.glob(\"*_plan_*.md\"))\n"
        "        for task_file in session_dir.glob(\"*_task_*.md\"):\n"
        "            state = _task_state(task_file)\n"
        "            if has_plan and state in STARTED_STATES:\n"
        "                return True\n"
        "    return False\n\n\n"
        "def _governance_failures() -> list[str]:\n"
        "    if Path.cwd().resolve() != SCRIPT_REPO_ROOT:\n"
        "        return [\n"
        "            \"runtime policy check must run from the repository root, not a copied or nested working tree\",\n"
        "            f\"expected cwd {SCRIPT_REPO_ROOT}, got {Path.cwd().resolve()}\",\n"
        "        ]\n"
        "    if _governed_session_started():\n"
        "        return []\n"
        "    return [\n"
        "        \"governed workbench state is not started for this delivery request\",\n"
        "        \"expected a non-fixture .agents/wb session with a plan and T-01 beyond pending before product validation\",\n"
        "    ]\n\n\n"
        "def main() -> int:\n"
        "    data = json.loads(POLICY_PATH.read_text(encoding=\"utf-8\"))\n"
        "    expected = {\n"
        "        \"workflow_mode\": \"agentic-folder\",\n"
        "        \"default_execution\": \"governed\",\n"
        "        \"evidence_required\": True,\n"
        "    }\n"
        "    failures = [\n"
        "        f\"{key}: expected {value!r}, got {data.get(key)!r}\"\n"
        "        for key, value in expected.items()\n"
        "        if data.get(key) != value\n"
        "    ]\n"
        "    failures.extend(_governance_failures())\n"
        "    if failures:\n"
        "        print(\"runtime policy check failed\")\n"
        "        for failure in failures:\n"
        "            print(f\"- {failure}\")\n"
        "        return 1\n"
        "    print(\"runtime policy check passed\")\n"
        "    return 0\n\n\n"
        "if __name__ == \"__main__\":\n"
        "    raise SystemExit(main())\n"
    )


def _copy_or_write_text(src: Path, dst: Path, fallback: str) -> None:
    if src.exists():
        _copy_file(src, dst)
    else:
        _write_text(dst, fallback)


def _prepare_fixture_repo(temp_root: Path) -> Path:
    ignore_scripts = shutil.ignore_patterns("__pycache__", ".pytest_cache", ".venv")
    _copy_tree(AGENTS_DIR / "scripts", temp_root / ".agents" / "scripts", ignore_scripts)
    _link_fixture_venv(temp_root)
    _copy_tree(AGENTS_DIR / "runtime", temp_root / ".agents" / "runtime", ignore_scripts)
    _copy_tree(AGENTS_DIR / "rules", temp_root / ".agents" / "rules")
    if (AGENTS_DIR / "skills").exists():
        _copy_tree(AGENTS_DIR / "skills", temp_root / ".agents" / "skills", ignore_scripts)
    if (DOCS_DIR / "templates").exists():
        _copy_tree(DOCS_DIR / "templates", temp_root / "docs" / "templates")

    for rel_path in (
        ".agents/agents",
        ".agents/tools.json",
        ".agents/agents.config",
        "README.md",
        "docs/agentic/agents-benchmark.md",
    ):
        src = ROOT_DIR / rel_path
        if src.exists():
            _copy_file(src, temp_root / rel_path)

    _write_text(temp_root / "AGENTS.md", _fixture_agents_text())

    roadmap_dst = temp_root / "docs" / "arc" / "GENERAL-ROADMAP.md"
    _write_text(roadmap_dst, _fixture_roadmap_text())

    _copy_or_write_text(
        FIXTURE_PARENT_SPEC_FILE,
        temp_root / "docs" / "arc" / "SPECS" / FIXTURE_PARENT_SPEC_FILE.name,
        _fixture_spec_text(
            FIXTURE_PARENT_SPEC_ID,
            "SPEC: Controlled Runtime Flow Benchmarks",
            "spec",
        ),
    )
    _copy_or_write_text(
        FIXTURE_CHILD_SPEC_FILE,
        temp_root / "docs" / "arc" / "SPECS" / FIXTURE_CHILD_SPEC_FILE.name,
        _fixture_spec_text(
            FIXTURE_CHILD_SPEC_ID,
            "SPEC CHILD: Runtime Flow Benchmark Scenarios",
            "spec-child",
        ),
    )

    session_dir = temp_root / ".agents" / "wb" / FIXTURE_WORKSTREAM_ID
    _write_text(session_dir / f"{FIXTURE_WORKSTREAM_ID}_plan_01.md", _fixture_plan_text())
    _write_text(session_dir / f"{FIXTURE_WORKSTREAM_ID}_task_01.md", _fixture_task_text())
    _write_text(session_dir / f"{FIXTURE_WORKSTREAM_ID}_log_01.md", _fixture_log_text())
    _write_text(session_dir / f"{FIXTURE_WORKSTREAM_ID}_report_01.md", _fixture_report_text())
    _write_text(temp_root / "docs" / "benchmark_problem.md", _hypothetical_problem_text())
    _write_text(temp_root / "app" / "runtime_policy.json", _runtime_policy_text())
    runtime_check = temp_root / "scripts" / "check_runtime_policy.py"
    _write_text(runtime_check, _runtime_policy_check_text())
    runtime_check.chmod(0o444)

    subprocess.run(["git", "init", "-q"], cwd=temp_root, check=False)

    return temp_root


def _context_bytes(repo_root: Path, artifacts: tuple[str, ...]) -> int:
    total = 0
    for rel_path in artifacts:
        file_path = repo_root / rel_path
        if file_path.exists():
            total += file_path.stat().st_size
    return total


def _benchmark_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("NO_COLOR", "1")
    env.setdefault("PYTHONUTF8", "1")
    for key in ("http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        env.pop(key, None)
    return env


def _tool_info_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "scenario_id": {"type": "string", "const": "live-tools-benchmark-discovery"},
            "tool_surface": {"type": "string"},
            "default_model": {"type": "string"},
            "default_reasoning_effort": {"type": "string"},
        },
        "required": [
            "scenario_id",
            "tool_surface",
            "default_model",
            "default_reasoning_effort",
        ],
    }


def _preflight_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "scenario_id": {"type": "string", "const": "live-implement-next-governance-preflight"},
            "next_task_id": {"type": "string"},
            "feature": {"type": "string"},
            "parent_spec": {"type": "string"},
            "child_spec": {"type": "string"},
            "saw_rules_loaded": {"type": "boolean"},
        },
        "required": [
            "scenario_id",
            "next_task_id",
            "feature",
            "parent_spec",
            "child_spec",
            "saw_rules_loaded",
        ],
    }


def _complete_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "scenario_id": {"type": "string", "const": "live-implement-start-complete-evidence"},
            "task_id": {"type": "string"},
            "completed": {"type": "boolean"},
            "evidence_recorded": {"type": "boolean"},
        },
        "required": ["scenario_id", "task_id", "completed", "evidence_recorded"],
    }


def _wb_update_task_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "scenario_id": {"type": "string", "const": "live-wb-update-task-evidence-timeline"},
            "task_id": {"type": "string"},
            "evidence_id": {"type": "string"},
            "task_marked_done": {"type": "boolean"},
            "timeline_written": {"type": "boolean"},
        },
        "required": [
            "scenario_id",
            "task_id",
            "evidence_id",
            "task_marked_done",
            "timeline_written",
        ],
    }


def _session_create_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "scenario_id": {
                "type": "string",
                "const": "live-wb-session-create-scripted-progress",
            },
            "session_id": {"type": "string"},
            "used_new_command": {"type": "boolean"},
            "used_wb_update_in_progress": {"type": "boolean"},
            "used_wb_update_evidence": {"type": "boolean"},
            "used_wb_update_done": {"type": "boolean"},
            "evidence_id": {"type": "string"},
            "task_marked_done": {"type": "boolean"},
            "manual_markdown_edit": {"type": "boolean"},
        },
        "required": [
            "scenario_id",
            "session_id",
            "used_new_command",
            "used_wb_update_in_progress",
            "used_wb_update_evidence",
            "used_wb_update_done",
            "evidence_id",
            "task_marked_done",
            "manual_markdown_edit",
        ],
    }


def _autonomous_delivery_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "scenario_id": {
                "type": "string",
                "const": "live-autonomous-agentic-folder-delivery",
            },
            "session_id": {"type": "string"},
            "problem_fixed": {"type": "boolean"},
            "verification_passed": {"type": "boolean"},
            "plan_created": {"type": "boolean"},
            "task_completed": {"type": "boolean"},
            "evidence_recorded": {"type": "boolean"},
            "used_governed_session": {"type": "boolean"},
            "used_scripted_task_flow": {"type": "boolean"},
            "manual_wb_task_edit": {"type": "boolean"},
        },
        "required": [
            "scenario_id",
            "session_id",
            "problem_fixed",
            "verification_passed",
            "plan_created",
            "task_completed",
            "evidence_recorded",
            "used_governed_session",
            "used_scripted_task_flow",
            "manual_wb_task_edit",
        ],
    }


def _wb_update_status_touch_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "scenario_id": {"type": "string", "const": "live-wb-update-status-touch"},
            "report_status": {"type": "string"},
            "touch_ran": {"type": "boolean"},
            "updated_at_changed": {"type": "boolean"},
        },
        "required": [
            "scenario_id",
            "report_status",
            "touch_ran",
            "updated_at_changed",
        ],
    }


def _wb_update_link_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "scenario_id": {"type": "string", "const": "live-wb-update-link"},
            "link_key": {"type": "string"},
            "link_value": {"type": "string"},
            "link_written": {"type": "boolean"},
        },
        "required": ["scenario_id", "link_key", "link_value", "link_written"],
    }


def _validate_tool_info(output: dict[str, Any], _repo_root: Path) -> list[str]:
    failures: list[str] = []
    if output.get("tool_surface") != "benchmark":
        failures.append("tool_surface != benchmark")
    if output.get("default_model") != DEFAULT_PROFILE.model:
        failures.append(f"default_model != {DEFAULT_PROFILE.model}")
    if output.get("default_reasoning_effort") != DEFAULT_PROFILE.reasoning_effort:
        failures.append(f"default_reasoning_effort != {DEFAULT_PROFILE.reasoning_effort}")
    return failures


def _validate_preflight(output: dict[str, Any], _repo_root: Path) -> list[str]:
    failures: list[str] = []
    if output.get("next_task_id") != "T-01":
        failures.append("next_task_id != T-01")
    if output.get("feature") != FIXTURE_FEATURE_ID:
        failures.append(f"feature != {FIXTURE_FEATURE_ID}")
    parent_spec = str(output.get("parent_spec", ""))
    child_spec = str(output.get("child_spec", ""))
    if FIXTURE_PARENT_SPEC_ID not in parent_spec:
        failures.append(f"parent_spec != {FIXTURE_PARENT_SPEC_ID}")
    if FIXTURE_CHILD_SPEC_ID not in child_spec:
        failures.append(f"child_spec != {FIXTURE_CHILD_SPEC_ID}")
    if output.get("saw_rules_loaded") is not True:
        failures.append("saw_rules_loaded != true")
    return failures


def _validate_completion(output: dict[str, Any], repo_root: Path) -> list[str]:
    failures: list[str] = []
    if output.get("task_id") != "T-01":
        failures.append("task_id != T-01")
    if output.get("completed") is not True:
        failures.append("completed != true")
    if output.get("evidence_recorded") is not True:
        failures.append("evidence_recorded != true")

    task_file = repo_root / ".agents" / "wb" / FIXTURE_WORKSTREAM_ID / f"{FIXTURE_WORKSTREAM_ID}_task_01.md"
    evidence_file = repo_root / ".agents" / "wb" / FIXTURE_WORKSTREAM_ID / ".evidence.jsonl"
    task_text = task_file.read_text(encoding="utf-8") if task_file.exists() else ""
    evidence_text = evidence_file.read_text(encoding="utf-8") if evidence_file.exists() else ""
    done_row_re = re.compile(
        r"\|\s*T-01\s*\|\s*done\s*\|\s*worker\s*\|\s*Run the controlled live benchmark fixture flow\."
        r"(?:\s*\(evidence:\s*E-[^)]+\))?\s*\|"
    )
    if not done_row_re.search(task_text):
        failures.append("fixture task not marked done")
    if LIVE_COMPLETE_COMMAND not in evidence_text or '"result": "passed"' not in evidence_text:
        failures.append("fixture evidence missing expected completion record")
    return failures


def _validate_wb_update_task(output: dict[str, Any], repo_root: Path) -> list[str]:
    failures: list[str] = []
    if output.get("task_id") != "T-02":
        failures.append("task_id != T-02")
    evidence_id = str(output.get("evidence_id", ""))
    if not evidence_id.startswith("E-"):
        failures.append("evidence_id missing E- prefix")
    if output.get("task_marked_done") is not True:
        failures.append("task_marked_done != true")
    if output.get("timeline_written") is not True:
        failures.append("timeline_written != true")

    session_dir = repo_root / ".agents" / "wb" / FIXTURE_WORKSTREAM_ID
    task_file = session_dir / f"{FIXTURE_WORKSTREAM_ID}_task_01.md"
    log_file = session_dir / f"{FIXTURE_WORKSTREAM_ID}_log_01.md"
    evidence_file = session_dir / ".evidence.jsonl"
    task_text = task_file.read_text(encoding="utf-8") if task_file.exists() else ""
    log_text = log_file.read_text(encoding="utf-8") if log_file.exists() else ""
    evidence_text = evidence_file.read_text(encoding="utf-8") if evidence_file.exists() else ""
    if "| T-02 | done | worker | Mark task progress through wb-update evidence and task commands. |" not in task_text:
        failures.append("fixture task T-02 not marked done with evidence")
    if "T-02 completed via wb-update benchmark" not in log_text:
        failures.append("timeline entry missing expected message")
    if evidence_id not in evidence_text or '"task_id": "T-02"' not in evidence_text:
        failures.append("evidence ledger missing T-02 record")
    return failures


def _validate_session_create(output: dict[str, Any], repo_root: Path) -> list[str]:
    failures: list[str] = []
    session_id = str(output.get("session_id", "")).strip()
    evidence_id = str(output.get("evidence_id", "")).strip()

    if not re.fullmatch(r"\d{6}_\d{4}_benchmark-created-session", session_id):
        failures.append("session_id does not match the expected created-session pattern")
    for key in (
        "used_new_command",
        "used_wb_update_in_progress",
        "used_wb_update_evidence",
        "used_wb_update_done",
        "task_marked_done",
    ):
        if output.get(key) is not True:
            failures.append(f"{key} != true")
    if output.get("manual_markdown_edit") is not False:
        failures.append("manual_markdown_edit != false")
    if not evidence_id.startswith("E-"):
        failures.append("evidence_id missing E- prefix")

    session_dir = repo_root / ".agents" / "wb" / session_id
    task_file = session_dir / f"{session_id}_task_01.md"
    evidence_file = session_dir / ".evidence.jsonl"
    if not session_dir.exists():
        failures.append("created session directory missing")
    task_text = task_file.read_text(encoding="utf-8") if task_file.exists() else ""
    evidence_text = evidence_file.read_text(encoding="utf-8") if evidence_file.exists() else ""
    if "| T-01 | done | worker |" not in task_text:
        failures.append("created session T-01 not marked done")
    if (
        evidence_id not in evidence_text
        or '"task_id": "T-01"' not in evidence_text
        or "benchmark created session scripted progress" not in evidence_text
    ):
        failures.append("created session evidence ledger missing expected T-01 record")
    return failures


def _validate_runtime_policy_file(repo_root: Path) -> list[str]:
    failures: list[str] = []
    policy_file = repo_root / "app" / "runtime_policy.json"
    check_file = repo_root / "scripts" / "check_runtime_policy.py"
    try:
        check_text = check_file.read_text(encoding="utf-8")
    except OSError as exc:
        failures.append(f"runtime policy check script could not be read: {exc}")
        check_text = ""
    if check_text != _runtime_policy_check_text():
        failures.append("runtime policy check script was modified")

    try:
        policy = json.loads(policy_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        failures.append(f"runtime policy could not be read: {exc}")
        policy = {}
    expected_policy = {
        "workflow_mode": "agentic-folder",
        "default_execution": "governed",
        "evidence_required": True,
    }
    for key, value in expected_policy.items():
        if policy.get(key) != value:
            failures.append(f"runtime policy {key} != {value!r}")
    return failures


def _validate_governed_session_delivery(session_id: str, repo_root: Path) -> list[str]:
    failures: list[str] = []
    session_dir = repo_root / ".agents" / "wb" / session_id
    plan_files = sorted(session_dir.glob("*_plan_*.md")) if session_dir.exists() else []
    task_files = sorted(session_dir.glob("*_task_*.md")) if session_dir.exists() else []
    evidence_file = session_dir / ".evidence.jsonl"
    if not session_dir.exists():
        failures.append("created governed session directory missing")
    if not plan_files:
        failures.append("created governed plan file missing")
    if not task_files:
        failures.append("created governed task file missing")

    task_text = task_files[0].read_text(encoding="utf-8") if task_files else ""
    evidence_text = evidence_file.read_text(encoding="utf-8") if evidence_file.exists() else ""
    if "| T-01 | done |" not in task_text and "- [x] T-01" not in task_text:
        failures.append("created governed task T-01 not marked done")
    if '"task_id": "T-01"' not in evidence_text or "check_runtime_policy.py" not in evidence_text:
        failures.append("evidence ledger missing expected verification record")
    return failures


def _validate_autonomous_delivery(output: dict[str, Any], repo_root: Path) -> list[str]:
    failures: list[str] = []
    session_id = str(output.get("session_id", "")).strip()
    if not session_id or session_id == FIXTURE_WORKSTREAM_ID or "/" in session_id or ".." in session_id:
        failures.append("session_id is missing or invalid")

    for key in (
        "problem_fixed",
        "verification_passed",
        "plan_created",
        "task_completed",
        "evidence_recorded",
        "used_governed_session",
        "used_scripted_task_flow",
    ):
        if output.get(key) is not True:
            failures.append(f"{key} != true")
    if output.get("manual_wb_task_edit") is not False:
        failures.append("manual_wb_task_edit != false")

    failures.extend(_validate_runtime_policy_file(repo_root))
    failures.extend(_validate_governed_session_delivery(session_id, repo_root))
    return failures


def _validate_wb_update_status_touch(output: dict[str, Any], repo_root: Path) -> list[str]:
    failures: list[str] = []
    if output.get("report_status") != "active":
        failures.append("report_status != active")
    if output.get("touch_ran") is not True:
        failures.append("touch_ran != true")
    if output.get("updated_at_changed") is not True:
        failures.append("updated_at_changed != true")

    report_file = repo_root / ".agents" / "wb" / FIXTURE_WORKSTREAM_ID / f"{FIXTURE_WORKSTREAM_ID}_report_01.md"
    report_text = report_file.read_text(encoding="utf-8") if report_file.exists() else ""
    if "status: active" not in report_text:
        failures.append("report status was not active")
    if "updated_at: '2026-04-23T20:06:00-03:00'" in report_text:
        failures.append("report updated_at was not changed from fixture timestamp")
    return failures


def _validate_wb_update_link(output: dict[str, Any], repo_root: Path) -> list[str]:
    failures: list[str] = []
    if output.get("link_key") != "postmortem":
        failures.append("link_key != postmortem")
    if output.get("link_value") != "docs/postmortem.md":
        failures.append("link_value != docs/postmortem.md")
    if output.get("link_written") is not True:
        failures.append("link_written != true")

    report_file = repo_root / ".agents" / "wb" / FIXTURE_WORKSTREAM_ID / f"{FIXTURE_WORKSTREAM_ID}_report_01.md"
    report_text = report_file.read_text(encoding="utf-8") if report_file.exists() else ""
    if "postmortem: docs/postmortem.md" not in report_text:
        failures.append("report link postmortem missing expected value")
    return failures


def _scenario_catalog() -> dict[str, LiveBenchmarkScenario]:
    session_path = f".agents/wb/{FIXTURE_WORKSTREAM_ID}"
    return {
        "live-tools-benchmark-discovery": LiveBenchmarkScenario(
            id="live-tools-benchmark-discovery",
            description="Use a real agent to inspect the benchmark tool contract.",
            purpose="Catch regressions where the benchmark surface is present but not usable or discoverable by a live agent.",
            tool_families=("exec_command", "tools", "benchmark"),
            scope="Read-only bounded discovery against the benchmark tool metadata.",
            context_artifacts=(
                "AGENTS.md",
                ".agents/agents",
                ".agents/tools.json",
                "docs/agentic/agents-benchmark.md",
            ),
            required_command_substrings=("tools info benchmark",),
            response_schema=_tool_info_schema(),
            prompt=(
                "You are running inside a controlled runtime benchmark fixture.\n"
                "Rules:\n"
                "- Use tools. Do not answer from memory.\n"
                "- Do not edit files.\n"
                "- You must inspect the benchmark surface with shell commands.\n"
                "- Return JSON only that matches the provided schema.\n\n"
                "Task:\n"
                "1. Run exactly `./.agents/agents tools info benchmark`.\n"
                "2. Extract the tool id, default model, and default reasoning effort for the benchmark.\n"
                "3. Return them in the schema."
            ),
            validator=_validate_tool_info,
            validation_check_count=3,
        ),
        "live-implement-next-governance-preflight": LiveBenchmarkScenario(
            id="live-implement-next-governance-preflight",
            description="Use a real agent to run governed preflight and report the next task context.",
            purpose="Catch regressions in rule/spec visibility and task discovery for governed feature execution.",
            tool_families=("exec_command", "implement", "rules"),
            scope="Read-only governed preflight against one controlled fixture session.",
            context_artifacts=(
                "AGENTS.md",
                f"{session_path}/{FIXTURE_WORKSTREAM_ID}_plan_01.md",
                f"{session_path}/{FIXTURE_WORKSTREAM_ID}_task_01.md",
                f"docs/arc/SPECS/{FIXTURE_PARENT_SPEC_FILE.name}",
                f"docs/arc/SPECS/{FIXTURE_CHILD_SPEC_FILE.name}",
            ),
            required_command_substrings=(f"implement next --session {FIXTURE_WORKSTREAM_ID}",),
            response_schema=_preflight_schema(),
            prompt=(
                "You are running inside a controlled runtime benchmark fixture.\n"
                "Rules:\n"
                "- Use tools. Do not answer from memory.\n"
                "- Do not edit files.\n"
                "- You must run the governed preflight command for the fixture session.\n"
                "- Return JSON only that matches the provided schema.\n\n"
                f"Task:\n"
                f"1. Run `./.agents/agents implement next --session {FIXTURE_WORKSTREAM_ID}`.\n"
                "2. Read the command output and extract the next task id, feature id, parent spec, child spec, and whether rules were loaded.\n"
                "3. Return those fields in the schema."
            ),
            validator=_validate_preflight,
            validation_check_count=5,
        ),
        "live-implement-start-complete-evidence": LiveBenchmarkScenario(
            id="live-implement-start-complete-evidence",
            description="Use a real agent to start and complete the fixture task, then confirm evidence exists.",
            purpose="Catch regressions in task transitions and evidence recording under a real tool-driven agent loop.",
            tool_families=("exec_command", "implement", "evidence"),
            scope="Controlled mutation of the isolated fixture workbench session only.",
            context_artifacts=(
                "AGENTS.md",
                f"{session_path}/{FIXTURE_WORKSTREAM_ID}_plan_01.md",
                f"{session_path}/{FIXTURE_WORKSTREAM_ID}_task_01.md",
                f"{session_path}/{FIXTURE_WORKSTREAM_ID}_log_01.md",
                f"docs/arc/SPECS/{FIXTURE_PARENT_SPEC_FILE.name}",
                f"docs/arc/SPECS/{FIXTURE_CHILD_SPEC_FILE.name}",
            ),
            required_command_substrings=(
                f"implement start --session {FIXTURE_WORKSTREAM_ID} --task-id T-01",
                f"implement complete --session {FIXTURE_WORKSTREAM_ID} --task-id T-01",
            ),
            response_schema=_complete_schema(),
            prompt=(
                "You are running inside a controlled runtime benchmark fixture.\n"
                "Rules:\n"
                "- Use tools. Do not answer from memory.\n"
                "- You may only mutate the isolated fixture session through the scaffold commands below.\n"
                "- Do not run help commands, create virtualenvs, install packages, copy the fixture repo, or set AGENTS_SCRIPT_PYTHON/PYTHONPATH.\n"
                "- Run only the two implement commands, then inspect the task file and `.evidence.jsonl` ledger.\n"
                "- Return JSON only that matches the provided schema.\n\n"
                "Task:\n"
                f"1. Run `./.agents/agents implement start --session {FIXTURE_WORKSTREAM_ID} --task-id T-01`.\n"
                f"2. Run `./.agents/agents implement complete --session {FIXTURE_WORKSTREAM_ID} --task-id T-01 --command \"{LIVE_COMPLETE_COMMAND}\" --result passed --artifact .agents/wb/{FIXTURE_WORKSTREAM_ID}/{FIXTURE_WORKSTREAM_ID}_task_01.md`.\n"
                f"3. Inspect `.agents/wb/{FIXTURE_WORKSTREAM_ID}/{FIXTURE_WORKSTREAM_ID}_task_01.md` and `.agents/wb/{FIXTURE_WORKSTREAM_ID}/.evidence.jsonl`.\n"
                "4. Return whether completion and evidence recording both succeeded."
            ),
            validator=_validate_completion,
            validation_check_count=4,
            min_tool_calls=2,
        ),
        "live-wb-update-task-evidence-timeline": LiveBenchmarkScenario(
            id="live-wb-update-task-evidence-timeline",
            description="Use wb-update scripts to register evidence, mark a task done, and append a timeline entry.",
            purpose="Catch regressions where the agent edits task markdown directly instead of using the wb-update automation path.",
            tool_families=("exec_command", "wb-update", "evidence", "timeline"),
            scope="Controlled mutation of the isolated fixture session through wb-update commands only.",
            context_artifacts=(
                "AGENTS.md",
                f"{session_path}/{FIXTURE_WORKSTREAM_ID}_task_01.md",
                f"{session_path}/{FIXTURE_WORKSTREAM_ID}_log_01.md",
            ),
            required_command_substrings=(
                f"wb-update evidence T-02 --session {FIXTURE_WORKSTREAM_ID}",
                f"wb-update task T-02 --session {FIXTURE_WORKSTREAM_ID} --mark-done --evidence-id",
                f"wb-update timeline --session {FIXTURE_WORKSTREAM_ID}",
            ),
            response_schema=_wb_update_task_schema(),
            prompt=(
                "You are running inside a controlled runtime benchmark fixture.\n"
                "Rules:\n"
                "- Use tools. Do not answer from memory.\n"
                "- Do not edit markdown directly.\n"
                "- Task state must change through wb-update commands.\n"
                "- Do not run help commands, inspect source code, inspect environment variables, create virtualenvs, install packages, copy files, or set AGENTS_SCRIPT_PYTHON/PYTHONPATH.\n"
                "- Run only the three wb-update commands, then inspect the task, log, and evidence files.\n"
                "- Return JSON only that matches the provided schema.\n\n"
                "Task:\n"
                f"1. Run `./.agents/agents wb-update evidence T-02 --session {FIXTURE_WORKSTREAM_ID} --command \"benchmark wb-update evidence\" --result passed --artifact .agents/wb/{FIXTURE_WORKSTREAM_ID}/{FIXTURE_WORKSTREAM_ID}_log_01.md` and capture the returned evidence id.\n"
                f"2. Run `./.agents/agents wb-update task T-02 --session {FIXTURE_WORKSTREAM_ID} --mark-done --evidence-id <captured-id>`.\n"
                f"3. Run `./.agents/agents wb-update timeline --session {FIXTURE_WORKSTREAM_ID} --message \"T-02 completed via wb-update benchmark\"`.\n"
                "4. Inspect the fixture task/log/evidence files and return whether the task was marked done and the timeline entry was written."
            ),
            validator=_validate_wb_update_task,
            validation_check_count=5,
            min_tool_calls=3,
        ),
        "live-wb-session-create-scripted-progress": LiveBenchmarkScenario(
            id="live-wb-session-create-scripted-progress",
            description="Use a real agent to create a new workbench session and advance T-01 through scripts only.",
            purpose=(
                "Catch regressions where agents manually create or edit wb artifacts instead of using "
                "`.agents/agents new` and `wb-update` for session/task state."
            ),
            tool_families=("exec_command", "new", "wb-update", "evidence"),
            scope="Controlled creation and mutation of one new isolated workbench session.",
            context_artifacts=(
                "AGENTS.md",
                ".agents/agents",
                "docs/templates/task.md",
                f"docs/arc/SPECS/{FIXTURE_PARENT_SPEC_FILE.name}",
                f"docs/arc/SPECS/{FIXTURE_CHILD_SPEC_FILE.name}",
            ),
            required_command_substrings=(
                (
                    "new benchmark-created-session --feature-id F-19 "
                    f"--parent-spec {FIXTURE_PARENT_SPEC_ID} --child-spec {FIXTURE_CHILD_SPEC_ID}"
                ),
                "wb-update task T-01 --session",
                "--mark-in-progress",
                "wb-update evidence T-01 --session",
                "--command \"benchmark created session scripted progress\" --result passed",
                "wb-update task T-01 --session",
                "--mark-done --evidence-id",
            ),
            forbidden_command_substrings=(
                "apply_patch",
                "cat > .agents/wb",
                "tee .agents/wb",
                "tee -a .agents/wb",
                "sed -i",
                "perl -pi",
                "python - <<",
                "python3 - <<",
                "node - <<",
                "> .agents/wb",
                ">> .agents/wb",
            ),
            response_schema=_session_create_schema(),
            prompt=(
                "You are running inside a controlled runtime benchmark fixture.\n"
                "Rules:\n"
                "- Use tools. Do not answer from memory.\n"
                "- Do not edit markdown directly.\n"
                "- Do not use apply_patch, sed -i, tee, cat redirects, echo redirects, Python, or Node to write workbench files.\n"
                "- Session creation must happen through `.agents/agents new`.\n"
                "- Task state and evidence must change through `wb-update`.\n"
                "- Do not run help commands, inspect source code, inspect environment variables, create virtualenvs, install packages, copy files, or set AGENTS_SCRIPT_PYTHON/PYTHONPATH.\n"
                "- Return JSON only that matches the provided schema.\n\n"
                "Task:\n"
                "1. Run "
                f"`./.agents/agents new benchmark-created-session --feature-id {FIXTURE_FEATURE_ID} --parent-spec {FIXTURE_PARENT_SPEC_ID} --child-spec {FIXTURE_CHILD_SPEC_ID}` "
                "and capture the created session id.\n"
                "2. Run `./.agents/agents wb-update task T-01 --session <created-session-id> --mark-in-progress`.\n"
                "3. Run `./.agents/agents wb-update evidence T-01 --session <created-session-id> --command \"benchmark created session scripted progress\" --result passed --artifact .agents/wb/<created-session-id>/<created-session-id>_task_01.md` and capture the evidence id.\n"
                "4. Run `./.agents/agents wb-update task T-01 --session <created-session-id> --mark-done --evidence-id <captured-id>`.\n"
                "5. Inspect the created session task file and `.evidence.jsonl` ledger.\n"
                "6. Return the created session id, captured evidence id, whether each scripted command was used, whether T-01 is done, and `manual_markdown_edit: false`."
            ),
            validator=_validate_session_create,
            validation_check_count=9,
            min_tool_calls=5,
        ),
        "live-autonomous-agentic-folder-delivery": LiveBenchmarkScenario(
            id="live-autonomous-agentic-folder-delivery",
            description="Use a real agent to discover the agentic-folder workflow, plan, execute, evidence, and verify a tiny fixture fix.",
            purpose=(
                "Measure whether a live mini-tier agent can choose the scaffold tools from repository context "
                "instead of being told the exact commands."
            ),
            tool_families=("exec_command", "new", "implement", "wb-update", "python"),
            scope="Controlled end-to-end mutation of a tiny fixture app plus one governed workbench session.",
            context_artifacts=(
                "AGENTS.md",
                ".agents/agents",
                ".agents/tools.json",
                "docs/benchmark_problem.md",
                "app/runtime_policy.json",
                "scripts/check_runtime_policy.py",
                f"docs/arc/SPECS/{FIXTURE_PARENT_SPEC_FILE.name}",
                f"docs/arc/SPECS/{FIXTURE_CHILD_SPEC_FILE.name}",
            ),
            required_command_substrings=(
                ".agents/agents new",
                "scripts/check_runtime_policy.py",
            ),
            any_required_command_groups=(
                ("wb-update evidence T-01 --session", "wb-update evidence --session", "implement complete --session"),
                ("wb-update task T-01 --session", "wb-update task --session", "implement start --session", "implement complete --session"),
                ("--mark-done --evidence-id", "--evidence-id", "implement complete --session"),
            ),
            forbidden_command_substrings=(
                "cp -a .",
                "rsync",
                "mkdir -p sandbox",
                "cd sandbox",
                "cp .agents/agents sandbox",
                "cp -R .agents",
                "AGENTS_SCRIPT_PYTHON",
                "PYTHONPATH=",
                "uv run --with",
                "cat > .agents/wb",
                "tee .agents/wb",
                "tee -a .agents/wb",
                "> .agents/wb",
                ">> .agents/wb",
                "verify-tasks --strict",
            ),
            response_schema=_autonomous_delivery_schema(),
            prompt=(
                "You are running inside a controlled benchmark fixture.\n"
                "Rules:\n"
                "- Use tools and inspect the repository as needed. Do not answer from memory.\n"
                "- Do not manually edit workbench task state or evidence ledgers.\n"
                "- When closing a task, record task-scoped closure evidence with the real verification command, a passed result, and an artifact path or note before marking it done.\n"
                "- You are not being given the exact scaffold commands; discover the normal repository workflow from local context.\n"
                "- Keep the product change minimal.\n"
                "- Keep this bounded: do not run broad lint suites, repository-wide tests, package installs, bootstrap, sync, or full session closure.\n"
                "- Operate in the current benchmark repository only; do not copy the repo or switch to a copied working tree.\n"
                "- Use the scaffold wrapper as provided; do not override AGENTS_SCRIPT_PYTHON, PYTHONPATH, UV cache settings, or install ad hoc Python packages.\n"
                "- Final verification for this scenario means the acceptance check named in the problem brief plus inspection of the workbench task/evidence files; do not run strict session verification or closure.\n"
                "- Do not polish or repair template prose in workbench files; the scaffold-created plan/task plus scripted task/evidence updates are sufficient.\n"
                "- Use repository docs, the tool catalog, and the scaffold command wrapper for operations; do not call `.agents/scripts/*.py` directly.\n"
                "- Do not inspect benchmark runner source or scaffold implementation internals unless a wrapper command fails.\n"
                "- Use at most 12 shell commands unless a command fails and needs one focused recovery.\n"
                "- Return JSON only that matches the provided schema after the work is complete.\n\n"
                "Task:\n"
                f"Deliver the request in `docs/benchmark_problem.md` end-to-end. Analyze the problem, create a new governed work plan/session for this request, do not reuse the existing `{FIXTURE_WORKSTREAM_ID}` fixture session, implement the smallest fix, record evidence, complete the work item, and run final verification.\n"
                "In the JSON response, report the session id you created or used, whether the runtime policy was fixed, whether verification passed, whether a plan exists, whether the task is completed, whether evidence was recorded, whether you used the governed session workflow, whether task state was changed through the scripted workflow, and whether you manually edited workbench task state."
            ),
            validator=_validate_autonomous_delivery,
            validation_check_count=10,
            min_tool_calls=5,
            timeout_seconds=240,
        ),
        "live-wb-update-status-touch": LiveBenchmarkScenario(
            id="live-wb-update-status-touch",
            description="Use wb-update scripts to set report status and refresh updated_at.",
            purpose="Catch regressions in script-based frontmatter writing for report artifacts.",
            tool_families=("exec_command", "wb-update", "status", "touch"),
            scope="Controlled mutation of the isolated fixture report frontmatter only.",
            context_artifacts=(
                "AGENTS.md",
                f"{session_path}/{FIXTURE_WORKSTREAM_ID}_report_01.md",
            ),
            required_command_substrings=(
                f"wb-update status --session {FIXTURE_WORKSTREAM_ID} --value active --file report",
                f"wb-update touch --session {FIXTURE_WORKSTREAM_ID}",
            ),
            response_schema=_wb_update_status_touch_schema(),
            prompt=(
                "You are running inside a controlled runtime benchmark fixture.\n"
                "Rules:\n"
                "- Use tools. Do not answer from memory.\n"
                "- Do not edit frontmatter directly.\n"
                "- Report status and timestamps must be updated through wb-update.\n"
                "- Do not run help commands, inspect source code, inspect environment variables, create virtualenvs, install packages, copy files, or set AGENTS_SCRIPT_PYTHON/PYTHONPATH.\n"
                "- Only read the report file, run the two wb-update commands, then re-read the report file.\n"
                "- Return JSON only that matches the provided schema.\n\n"
                "Task:\n"
                f"1. Read the fixture report file for session `{FIXTURE_WORKSTREAM_ID}` and note its current `updated_at`.\n"
                f"2. Run `./.agents/agents wb-update status --session {FIXTURE_WORKSTREAM_ID} --value active --file report`.\n"
                f"3. Run `./.agents/agents wb-update touch --session {FIXTURE_WORKSTREAM_ID}`.\n"
                "4. Re-read the report file and return whether status stayed active and updated_at changed."
            ),
            validator=_validate_wb_update_status_touch,
            validation_check_count=4,
            min_tool_calls=3,
        ),
        "live-wb-update-link": LiveBenchmarkScenario(
            id="live-wb-update-link",
            description="Use wb-update link to write a frontmatter link entry.",
            purpose="Catch regressions in script-based frontmatter link updates.",
            tool_families=("exec_command", "wb-update", "link"),
            scope="Controlled mutation of the isolated fixture report links only.",
            context_artifacts=(
                "AGENTS.md",
                f"{session_path}/{FIXTURE_WORKSTREAM_ID}_report_01.md",
            ),
            required_command_substrings=(
                f"wb-update link --session {FIXTURE_WORKSTREAM_ID} --file report --key postmortem --value docs/postmortem.md",
            ),
            response_schema=_wb_update_link_schema(),
            prompt=(
                "You are running inside a controlled runtime benchmark fixture.\n"
                "Rules:\n"
                "- Use tools. Do not answer from memory.\n"
                "- Do not edit frontmatter directly.\n"
                "- Link updates must be done through wb-update link.\n"
                "- Do not run help commands, inspect source code, inspect environment variables, inspect mounts, create virtualenvs, install packages, copy files, or set AGENTS_SCRIPT_PYTHON/PYTHONPATH.\n"
                "- Run only the wb-update link command, then re-read the report file.\n"
                "- Return JSON only that matches the provided schema.\n\n"
                "Task:\n"
                f"1. Run `./.agents/agents wb-update link --session {FIXTURE_WORKSTREAM_ID} --file report --key postmortem --value docs/postmortem.md`.\n"
                "2. Re-read the fixture report file and confirm the frontmatter link was written.\n"
                "3. Return the key, value, and whether the link write succeeded."
            ),
            validator=_validate_wb_update_link,
            validation_check_count=4,
        ),
    }


SCENARIOS = _scenario_catalog()


def _parse_json_line(line: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(line)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _extract_command_excerpt(arguments_raw: str) -> str:
    try:
        parsed = json.loads(arguments_raw)
    except json.JSONDecodeError:
        return _excerpt(arguments_raw)
    if isinstance(parsed, dict):
        for key in ("cmd", "command"):
            value = parsed.get(key)
            if isinstance(value, str):
                return _excerpt(value, 1000)
        args_value = parsed.get("args")
        if isinstance(args_value, list):
            rendered = " ".join(str(item) for item in args_value)
            if rendered:
                return _excerpt(rendered, 1000)
    return _excerpt(arguments_raw)


def _observed_events_from_stdout(stdout: str) -> list[dict[str, Any]]:
    events = []
    for raw_line in stdout.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        parsed = _parse_json_line(stripped)
        if parsed is not None:
            events.append(parsed)
    return events


def _observed_command_key(call_entry: dict[str, Any]) -> str:
    return f"{call_entry['name']}::{call_entry['command_excerpt']}"


def _record_observed_call(
    call_entry: dict[str, Any],
    tool_calls: list[dict[str, Any]],
    call_index: dict[str, dict[str, Any]],
    prior_failures: dict[str, int],
    *,
    index_key: str | None,
) -> int:
    tool_calls.append(call_entry)
    if index_key:
        call_index[index_key] = call_entry
    return 1 if prior_failures.get(_observed_command_key(call_entry), 0) > 0 else 0


def _handle_function_call_payload(
    payload: dict[str, Any],
    tool_calls: list[dict[str, Any]],
    call_index: dict[str, dict[str, Any]],
    prior_failures: dict[str, int],
) -> int:
    arguments_raw = str(payload.get("arguments", ""))
    call_entry = {
        "call_id": payload.get("call_id"),
        "name": str(payload.get("name", "")),
        "arguments_excerpt": _excerpt(arguments_raw),
        "command_excerpt": _extract_command_excerpt(arguments_raw),
    }
    call_id = payload.get("call_id")
    return _record_observed_call(
        call_entry,
        tool_calls,
        call_index,
        prior_failures,
        index_key=call_id if isinstance(call_id, str) else None,
    )


def _handle_failed_call_output(
    call_id: Any,
    call_index: dict[str, dict[str, Any]],
    prior_failures: dict[str, int],
) -> int:
    call_entry = call_index.get(str(call_id)) if call_id is not None else None
    if call_entry:
        command_key = _observed_command_key(call_entry)
        prior_failures[command_key] = prior_failures.get(command_key, 0) + 1
    return 1


def _handle_command_execution_event(
    event: dict[str, Any],
    item: dict[str, Any],
    tool_calls: list[dict[str, Any]],
    call_index: dict[str, dict[str, Any]],
    prior_failures: dict[str, int],
) -> tuple[int, int]:
    event_type = str(event.get("type", ""))
    item_id = str(item.get("id", ""))
    if event_type == "item.started":
        command_text = str(item.get("command", ""))
        call_entry = {
            "call_id": item_id,
            "name": "command_execution",
            "arguments_excerpt": _excerpt(command_text, 1000),
            "command_excerpt": _excerpt(command_text, 1000),
        }
        retry_count = _record_observed_call(
            call_entry,
            tool_calls,
            call_index,
            prior_failures,
            index_key=item_id,
        )
        return 0, retry_count
    if event_type in {"item.completed", "item.complete"} and item.get("exit_code") not in (None, 0):
        call_entry = call_index.get(item_id)
        if call_entry is not None:
            call_entry["exit_code"] = item.get("exit_code")
            call_entry["aggregated_output_excerpt"] = _excerpt(str(item.get("aggregated_output", "")), 1000)
        return _handle_failed_call_output(item_id, call_index, prior_failures), 0
    if event_type in {"item.completed", "item.complete"}:
        call_entry = call_index.get(item_id)
        if call_entry is not None:
            call_entry["exit_code"] = item.get("exit_code")
            call_entry["aggregated_output_excerpt"] = _excerpt(str(item.get("aggregated_output", "")), 1000)
    return 0, 0


def _parse_observed_tool_data(stdout: str) -> tuple[list[dict[str, Any]], int, int]:
    call_index: dict[str, dict[str, Any]] = {}
    tool_calls: list[dict[str, Any]] = []
    error_count = 0
    retry_count = 0
    prior_failures: dict[str, int] = {}

    for event in _observed_events_from_stdout(stdout):
        payload = event.get("payload") if event.get("type") == "response_item" else event
        if isinstance(payload, dict):
            payload_type = payload.get("type")
            if payload_type == "function_call":
                retry_count += _handle_function_call_payload(payload, tool_calls, call_index, prior_failures)
            elif payload_type == "function_call_output":
                output_text = str(payload.get("output", ""))
                match = EXIT_CODE_RE.search(output_text)
                if match and match.group(1) != "0":
                    error_count += _handle_failed_call_output(payload.get("call_id"), call_index, prior_failures)
            elif payload_type == "error" or event.get("type") == "error":
                error_count += 1
        item = event.get("item")
        if isinstance(item, dict) and item.get("type") == "command_execution":
            event_errors, event_retries = _handle_command_execution_event(
                event, item, tool_calls, call_index, prior_failures
            )
            error_count += event_errors
            retry_count += event_retries

    return tool_calls, error_count, retry_count


def _load_structured_output(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        raise ValueError("Codex returned empty structured output")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("Codex structured output was not a JSON object")
    return parsed


def _required_commands_present(tool_calls: list[dict[str, Any]], required: tuple[str, ...]) -> list[str]:
    failures: list[str] = []
    call_haystack = "\n".join(
        f"{call.get('name', '')} {call.get('arguments_excerpt', '')} {call.get('command_excerpt', '')}"
        for call in tool_calls
    )
    for command_substring in required:
        if command_substring not in call_haystack:
            failures.append(f"required tool command not observed: {command_substring}")
    return failures


def _any_required_commands_present(
    tool_calls: list[dict[str, Any]], groups: tuple[tuple[str, ...], ...]
) -> list[str]:
    failures: list[str] = []
    call_haystack = "\n".join(
        f"{call.get('name', '')} {call.get('arguments_excerpt', '')} {call.get('command_excerpt', '')}"
        for call in tool_calls
    )
    for group in groups:
        if not any(command_substring in call_haystack for command_substring in group):
            rendered = " OR ".join(group)
            failures.append(f"required tool command group not observed: {rendered}")
    return failures


def _forbidden_commands_absent(tool_calls: list[dict[str, Any]], forbidden: tuple[str, ...]) -> list[str]:
    failures: list[str] = []
    call_haystack = "\n".join(
        f"{call.get('name', '')} {call.get('arguments_excerpt', '')} {call.get('command_excerpt', '')}"
        for call in tool_calls
    )
    for command_substring in forbidden:
        if command_substring in call_haystack:
            failures.append(f"forbidden tool command observed: {command_substring}")
    return failures


def _live_scenario_command(
    scenario: LiveBenchmarkScenario,
    profile: BenchmarkProfile,
    fixture_root: Path,
    schema_path: Path,
    output_path: Path,
) -> list[str]:
    command = [
        "codex",
        "exec",
        "--json",
        "--ephemeral",
        "--skip-git-repo-check",
        "--color",
        "never",
        "-m",
        profile.model,
        "-c",
        f'model_reasoning_effort="{profile.reasoning_effort}"',
        "-c",
        "features.apps=false",
        "-c",
        "apps._default.enabled=false",
        "-c",
        "apps._default.default_tools_enabled=false",
        "--full-auto",
        "-C",
        str(fixture_root),
        "--add-dir",
        str(fixture_root / ".agents"),
        "--output-schema",
        str(schema_path),
        "-o",
        str(output_path),
        scenario.prompt,
    ]
    sandbox_insert_at = command.index("--full-auto")
    if scenario.id == "live-autonomous-agentic-folder-delivery":
        command.remove("--full-auto")
        command.insert(sandbox_insert_at, "--dangerously-bypass-approvals-and-sandbox")
    else:
        command[sandbox_insert_at:sandbox_insert_at] = ["-s", "workspace-write"]
        command.insert(4, "--ignore-user-config")
    return command


def _live_scenario_env(scenario: LiveBenchmarkScenario) -> dict[str, str]:
    env = _benchmark_env()
    if scenario.id == "live-autonomous-agentic-folder-delivery":
        env["AGENTS_PROTECTED_SESSION_IDS"] = FIXTURE_WORKSTREAM_ID
    return env


def _timeout_streams(exc: subprocess.TimeoutExpired) -> tuple[str, str]:
    stdout = exc.stdout or ""
    stderr = exc.stderr or ""
    if isinstance(stdout, bytes):
        stdout = stdout.decode("utf-8", errors="replace")
    if isinstance(stderr, bytes):
        stderr = stderr.decode("utf-8", errors="replace")
    return stdout, stderr


def _run_live_scenario(scenario: LiveBenchmarkScenario, profile: BenchmarkProfile) -> dict[str, Any]:
    prompt_bytes = _json_size(scenario.prompt)
    temp_parent = Path(os.environ.get("AGENTS_BENCHMARK_TEMP_PARENT", "/tmp/agents-benchmark-live"))
    temp_parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="agents-benchmark-live-", dir=temp_parent) as temp_dir:
        fixture_root = _prepare_fixture_repo(Path(temp_dir))
        context_bytes = _context_bytes(fixture_root, scenario.context_artifacts)
        tmp_dir = fixture_root / ".agents" / "tmp" / "benchmarks"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        schema_path = tmp_dir / f"{scenario.id}-schema.json"
        output_path = tmp_dir / f"{scenario.id}-output.json"
        schema_path.write_text(json.dumps(scenario.response_schema, indent=2), encoding="utf-8")
        command = _live_scenario_command(scenario, profile, fixture_root, schema_path, output_path)

        started_at = time.perf_counter()
        timed_out = False

        try:
            completed = subprocess.run(
                command,
                cwd=fixture_root,
                capture_output=True,
                text=True,
                timeout=scenario.timeout_seconds,
                env=_live_scenario_env(scenario),
            )
            returncode = completed.returncode
            stdout = completed.stdout or ""
            stderr = completed.stderr or ""
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            returncode = 124
            stdout, stderr = _timeout_streams(exc)
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        tool_calls, error_count, retry_count = _parse_observed_tool_data(stdout)

        failures: list[str] = []
        if timed_out:
            failures.append(f"codex exec timed out after {scenario.timeout_seconds}s")
            error_count += 1
        elif returncode != 0:
            failures.append(f"codex exec exited with code {returncode}")
        if not output_path.exists():
            failures.append("structured output file was not produced")

        output_json: dict[str, Any] | None = None
        if output_path.exists():
            try:
                output_json = _load_structured_output(output_path)
            except (ValueError, json.JSONDecodeError) as exc:
                failures.append(str(exc))

        if len(tool_calls) < scenario.min_tool_calls:
            failures.append(f"observed tool_call_count {len(tool_calls)} < {scenario.min_tool_calls}")

        failures.extend(_required_commands_present(tool_calls, scenario.required_command_substrings))
        failures.extend(_any_required_commands_present(tool_calls, scenario.any_required_command_groups))
        failures.extend(_forbidden_commands_absent(tool_calls, scenario.forbidden_command_substrings))
        if output_json is not None:
            failures.extend(scenario.validator(output_json, fixture_root))

        checks_total = (
            4
            + len(scenario.required_command_substrings)
            + len(scenario.any_required_command_groups)
            + len(scenario.forbidden_command_substrings)
            + scenario.validation_check_count
        )
        checks_passed = max(checks_total - len(failures), 0)
        accuracy = round(checks_passed / checks_total, 4) if checks_total else 1.0
        tool_success_count = max(len(tool_calls) - error_count, 0)
        tool_success_rate = round(tool_success_count / len(tool_calls), 4) if tool_calls else 0.0

        return {
            "id": scenario.id,
            "backend": "live_agent",
            "pass": not failures,
            "duration_ms": duration_ms,
            "context_bytes": context_bytes,
            "prompt_bytes": prompt_bytes,
            "tool_call_count": len(tool_calls),
            "tool_success_count": tool_success_count,
            "tool_success_rate": tool_success_rate,
            "error_count": error_count,
            "retry_count": retry_count,
            "checks_total": checks_total,
            "checks_passed": checks_passed,
            "accuracy": accuracy,
            "observed_tool_calls": tool_calls,
            "failure_reasons": failures,
            "output_json": output_json,
            "output_excerpt": _excerpt(json.dumps(output_json, ensure_ascii=True))
            if output_json is not None
            else _excerpt(stdout + "\n" + stderr),
            "stdout_excerpt": _excerpt(stdout, 400),
            "stderr_excerpt": _excerpt(stderr, 400),
            "command": command,
        }


def _validate_scenario_ids(scenario_ids: list[str]) -> list[str]:
    selected = scenario_ids or list(SCENARIOS)
    missing = sorted(set(selected) - set(SCENARIOS))
    if missing:
        raise ValueError("Unknown benchmark scenario(s): " + ", ".join(missing))
    return selected


def run_suite(
    scenario_ids: list[str],
    profile: BenchmarkProfile,
    output_path: Path | None = None,
    *,
    executor: Callable[[LiveBenchmarkScenario, BenchmarkProfile], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    selected_ids = _validate_scenario_ids(scenario_ids)
    run_scenario = executor or _run_live_scenario

    started_at = time.perf_counter()
    scenario_results = [run_scenario(SCENARIOS[scenario_id], profile) for scenario_id in selected_ids]
    total_duration_ms = round((time.perf_counter() - started_at) * 1000)

    payload = {
        "pack_id": BENCHMARK_PACK_ID,
        "generated_at": _utc_now(),
        "benchmark_profile": profile.to_dict(),
        "scenario_count": len(scenario_results),
        "pass": all(result["pass"] for result in scenario_results),
        "duration_ms": total_duration_ms,
        "tool_call_count": sum(int(result["tool_call_count"]) for result in scenario_results),
        "tool_success_count": sum(int(result["tool_success_count"]) for result in scenario_results),
        "error_count": sum(int(result["error_count"]) for result in scenario_results),
        "retry_count": sum(int(result["retry_count"]) for result in scenario_results),
        "checks_total": sum(int(result["checks_total"]) for result in scenario_results),
        "checks_passed": sum(int(result["checks_passed"]) for result in scenario_results),
        "context_bytes_total": sum(int(result["context_bytes"]) for result in scenario_results),
        "prompt_bytes_total": sum(int(result["prompt_bytes"]) for result in scenario_results),
        "scenarios": scenario_results,
    }
    payload["accuracy"] = (
        round(payload["checks_passed"] / payload["checks_total"], 4)
        if payload["checks_total"]
        else 1.0
    )
    payload["tool_success_rate"] = (
        round(payload["tool_success_count"] / payload["tool_call_count"], 4)
        if payload["tool_call_count"]
        else 0.0
    )

    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    return payload


def _save_payload(payload: dict[str, Any]) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = RESULTS_DIR / f"{_timestamp_slug()}_{BENCHMARK_PACK_ID}.json"
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    _write_stable_snapshots(payload, output_path)
    return output_path


def _print_list() -> None:
    print(f"{BENCHMARK_PACK_ID}")
    for scenario in SCENARIOS.values():
        print(f"- {scenario.id}: {scenario.description}")


def _print_show(scenario_id: str, pretty: bool = False) -> None:
    scenario = SCENARIOS.get(scenario_id)
    if scenario is None:
        raise ValueError(f"Unknown benchmark scenario: {scenario_id}")
    payload = {
        "id": scenario.id,
        "description": scenario.description,
        "purpose": scenario.purpose,
        "tool_families": list(scenario.tool_families),
        "scope": scenario.scope,
        "context_artifacts": list(scenario.context_artifacts),
        "required_command_substrings": list(scenario.required_command_substrings),
        "any_required_command_groups": [list(group) for group in scenario.any_required_command_groups],
        "forbidden_command_substrings": list(scenario.forbidden_command_substrings),
        "min_tool_calls": scenario.min_tool_calls,
        "timeout_seconds": scenario.timeout_seconds,
        "benchmark_profile": DEFAULT_PROFILE.to_dict(),
    }
    print(to_json_text(payload, pretty=pretty, sort_keys=False))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run controlled live-agent runtime-flow benchmark scenarios.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List available benchmark scenarios")

    show_parser = subparsers.add_parser("show", help="Show one benchmark scenario")
    show_parser.add_argument("scenario_id")
    show_parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")

    run_parser = subparsers.add_parser("run", help="Run one or more benchmark scenarios")
    run_parser.add_argument("scenario_ids", nargs="*", help="Optional benchmark scenario ids")
    run_parser.add_argument("--save", action="store_true", help="Save results under .agents/data/benchmarks/results/")
    run_parser.add_argument("--output", type=Path, help="Write the JSON payload to an explicit path")
    run_parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "list":
            _print_list()
            return 0

        if args.command == "show":
            _print_show(args.scenario_id, args.pretty)
            return 0

        if args.command == "run":
            payload = run_suite(args.scenario_ids, DEFAULT_PROFILE, args.output)
            saved_path = _save_payload(payload) if args.save else None
            if saved_path is not None:
                payload = dict(payload)
                payload["saved_to"] = _relative_from_root(saved_path)
            print(to_json_text(payload, pretty=args.pretty, sort_keys=False))
            return 0 if payload["pass"] else 1
    except ValueError as exc:
        print(f"❌ {exc}")
        return 2
    except subprocess.TimeoutExpired as exc:
        print(
            to_json_text(
                {
                    "pack_id": BENCHMARK_PACK_ID,
                    "pass": False,
                    "error": f"benchmark timed out after {exc.timeout}s",
                },
                pretty=False,
                sort_keys=False,
            )
        )
        return 1

    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
