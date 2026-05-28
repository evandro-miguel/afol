from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from agentic_scaffold.config import RuntimeConfig, build_runtime_config
from agentic_scaffold.models import ActionResult, ActionSpec, RepoManifest, SkillSummary, UndoResult
from agentic_scaffold.registry import RuntimeRegistry
from agentic_scaffold.services.adoption import AdoptionPlanner
from agentic_scaffold.services.changes import ChangeService
from agentic_scaffold.services.journal import JournalStore
from agentic_scaffold.services.search import KnowledgeSearchService
from agentic_scaffold.services.validation import StructureValidator
from agentic_scaffold.services.workspace import WorkspaceInspector

_ACTION_SPECS: tuple[ActionSpec, ...] = (
    ActionSpec(
        action_id="inspect",
        cli_command="inspect",
        mcp_tool="inspect_workspace",
        description="Inspect repository tree with bounded depth and visibility filters.",
        side_effect="read",
    ),
    ActionSpec(
        action_id="health",
        cli_command="health",
        mcp_tool="runtime_health",
        description="Run minimal runtime health and registration checks.",
        side_effect="read",
        required_guards=["runtime_config", "tool_registration", "command_registry"],
    ),
)


class AgenticRuntime:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config
        self.journal = JournalStore(config.journal_root)
        self.workspace = WorkspaceInspector(config.repo_root)
        self.search = KnowledgeSearchService(config.repo_root, config.search_roots)
        self.validator = StructureValidator(config)
        self.adoption = AdoptionPlanner(config)
        self.changes = ChangeService(config, self.journal)
        self.registry = RuntimeRegistry(config)

    @classmethod
    def from_repo_root(cls, repo_root: Path | None = None) -> "AgenticRuntime":
        return cls(build_runtime_config(repo_root))

    @classmethod
    def action_specs(cls) -> tuple[ActionSpec, ...]:
        return _ACTION_SPECS

    @classmethod
    def action_spec(cls, action_id: str) -> ActionSpec | None:
        for spec in cls.action_specs():
            if spec.action_id == action_id:
                return spec
        return None

    def run_action(
        self,
        action_id: str,
        *,
        depth: int = 3,
        include_hidden: bool = False,
        include_generated: bool = False,
        max_entries: int = 500,
    ) -> ActionResult:
        if action_id == "inspect":
            if depth < 0 or depth > 10:
                return ActionResult(
                    status="error",
                    message="depth must be between 0 and 10",
                    payload={"error": "depth out of range"},
                )
            if max_entries < 1 or max_entries > 5000:
                return ActionResult(
                    status="error",
                    message="max_entries must be between 1 and 5000",
                    payload={"error": "max_entries out of range"},
                )
            summary = self.workspace.inspect(
                depth=depth,
                include_hidden=include_hidden,
                include_generated=include_generated,
                max_entries=max_entries,
            )
            return ActionResult(
                status="ok",
                message="inspect completed",
                payload=summary.model_dump(mode="json"),
            )
        if action_id == "health":
            required_commands = ("status", "knowledge", "verify-tasks")
            registry_names = {command["name"] for command in self.registry.manifest()}
            command_registry_ok = all(command in registry_names for command in required_commands)
            tool_catalog = self.tool_catalog_resource()
            checks: dict[str, Any] = {
                "runtime_root": str(self.config.repo_root),
                "command_registry": {
                    "required_available": command_registry_ok,
                    "required": list(required_commands),
                },
                "tool_catalog": {
                    "available": bool(tool_catalog.get("available", False)),
                },
                "search_roots": {
                    "count": len(self.config.search_roots),
                    "paths": [str(root) for root in self.config.search_roots],
                },
            }
            if command_registry_ok and bool(tool_catalog.get("available", False)) and self.config.repo_root.exists():
                return ActionResult(
                    status="ok",
                    message="runtime health check passed",
                    payload={
                        "status": "healthy",
                        "checks": checks,
                    },
                )
            return ActionResult(
                status="error",
                message="runtime health check failed",
                payload={
                    "status": "unhealthy",
                    "checks": checks,
                    "missing": [
                        {"type": "command_registry", "detail": "required command missing"}
                        for missing in required_commands
                        if missing not in registry_names
                    ],
                },
                next_step_hint="Fix runtime command registration or tool catalog availability.",
            )
        return ActionResult(
            status="error",
            message=f"unknown action: {action_id}",
            payload={"available_actions": [spec.action_id for spec in self.action_specs()]},
        )

    def generate_manifest(self) -> RepoManifest:
        repo_root = self.config.repo_root
        docs_md = sum(1 for _ in (repo_root / "docs").rglob("*.md")) if (repo_root / "docs").exists() else 0
        script_files = (
            sum(1 for _ in (repo_root / ".agents" / "scripts").glob("*.py"))
            if (repo_root / ".agents" / "scripts").exists()
            else 0
        )
        test_files = (
            sum(1 for _ in (repo_root / ".agents" / "scripts" / "tests").rglob("test_*.py"))
            if (repo_root / ".agents" / "scripts" / "tests").exists()
            else 0
        )
        skills_dir = repo_root / ".agents" / "skills"
        skills = []
        if skills_dir.exists():
            for skill_dir in sorted(path for path in skills_dir.iterdir() if path.is_dir()):
                skills.append(SkillSummary(name=skill_dir.name, path=skill_dir.relative_to(repo_root).as_posix()))
        tool_catalog_count = 0
        tool_catalog_tools = []
        tools_path = repo_root / ".agents" / "tools.json"
        if tools_path.exists():
            try:
                payload = json.loads(tools_path.read_text(encoding="utf-8"))
                raw_tools = payload.get("tools")
                if isinstance(payload, dict) and isinstance(raw_tools, list):
                    tool_catalog_tools = [tool for tool in raw_tools if isinstance(tool, dict)]
                    tool_catalog_count = len(tool_catalog_tools)
            except Exception:
                tool_catalog_count = 0
                tool_catalog_tools = []
        return RepoManifest(
            repo_root=str(repo_root),
            docs_markdown_files=docs_md,
            script_files=script_files,
            test_files=test_files,
            skill_count=len(skills),
            skills=skills,
            runtime_docs={name: (repo_root / name).exists() for name in self.config.runtime_docs},
            tool_catalog_count=tool_catalog_count,
            governed_execution_contract={
                "applies_when": "governed implementation, validation, or delivery work",
                "session_root": ".agents/wb",
                "required_order": [
                    "create_or_target_session_before_product_edits",
                    "move_task_to_in_progress_before_product_edits",
                    "implement_smallest_change",
                    "run_requested_verification",
                    "record_task_scoped_evidence",
                    "mark_done_only_with_evidence_id",
                ],
                "wrapper_commands": [
                    ".agents/agents new <theme> --feature-id <F-id> --parent-spec <spec-id>",
                    ".agents/agents implement start --session <session-id> --task-id T-01",
                    ".agents/agents implement complete --session <session-id> --task-id T-01 --command \"<verification command>\" --result passed --artifact <path-or-report>",
                ],
                "forbidden_shortcuts": [
                    "product_edit_before_session_and_in_progress_task",
                    "manual_task_done_edit",
                    "manual_evidence_jsonl_edit",
                    "task_created_as_done",
                    "session_outside_.agents/wb",
                ],
            },
            major_surfaces=list(self.config.manifest_major_surfaces),
            search_roots=[root.relative_to(repo_root).as_posix() for root in self.config.search_roots],
            write_blocklist=list(self.config.write_blocklist),
        )

    def command_registry_resource(self) -> dict[str, Any]:
        return {"available": True, "commands": self.registry.manifest()}

    def tool_catalog_resource(self) -> dict[str, Any]:
        path = self.config.repo_root / ".agents" / "tools.json"
        if not path.exists():
            return {"available": False, "tools": []}
        tool_catalog_tools: list[dict[str, object]] = []
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            raw_tools = payload.get("tools") if isinstance(payload, dict) else []
            if isinstance(raw_tools, list):
                tool_catalog_tools = [tool for tool in raw_tools if isinstance(tool, dict)]
        except (OSError, json.JSONDecodeError, AttributeError):
            return {"available": False, "tools": []}

        return {
            "available": True,
            "tool_count": len(tool_catalog_tools),
            "tools": [
                {
                    "id": item.get("id"),
                    "type": item.get("type"),
                    "wrapper_command": item.get("wrapper_command"),
                }
                for item in tool_catalog_tools
            ],
        }

    def undo_last_change(self) -> UndoResult:
        return self.journal.undo_latest(self.config.repo_root)
