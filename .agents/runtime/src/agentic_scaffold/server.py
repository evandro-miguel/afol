from __future__ import annotations

from pathlib import Path

from fastmcp import FastMCP
from fastmcp.server.middleware.error_handling import ErrorHandlingMiddleware
from fastmcp.server.middleware.response_limiting import ResponseLimitingMiddleware
from fastmcp.server.providers.skills import SkillsDirectoryProvider

from agentic_scaffold.models import (
    ArchiveResult,
    FileWriteResult,
    RepoManifest,
    SearchResponse,
    UndoResult,
    ValidationReport,
    WorkspaceSummary,
)
from agentic_scaffold.runtime import AgenticRuntime

INSTRUCTIONS = (
    "Use this MCP as the fast lane for scaffold inspection, validation, safe archiving, "
    "controlled file writes, and reversible repository maintenance. Prefer search_docs and "
    "generate_manifest before broad reads. Use archive_paths instead of hard deletes."
)


def build_mcp(repo_root: Path | None = None) -> FastMCP:
    runtime = AgenticRuntime.from_repo_root(repo_root or Path(__file__).resolve())
    providers = []
    skills_root = runtime.config.repo_root / ".agents" / "skills"
    if skills_root.exists():
        providers.append(SkillsDirectoryProvider(roots=skills_root, supporting_files="template"))

    mcp = FastMCP(
        name="agentic-runtime",
        instructions=INSTRUCTIONS,
        version="0.1.0",
        middleware=[
            ErrorHandlingMiddleware(include_traceback=False),
            ResponseLimitingMiddleware(max_size=200_000),
        ],
        providers=providers,
        strict_input_validation=True,
    )

    @mcp.tool(description="Inspect the repository tree with bounded depth and entry limits.")
    def inspect_workspace(depth: int = 3, include_hidden: bool = False, max_entries: int = 500) -> WorkspaceSummary:
        return runtime.workspace.inspect(depth=depth, include_hidden=include_hidden, max_entries=max_entries)

    @mcp.tool(description="Search markdown docs, workbench artifacts, map docs, and skills with fuzzy ranking.")
    def search_docs(query: str, limit: int = 8) -> SearchResponse:
        return runtime.search.search(query=query, limit=limit)

    @mcp.tool(description="Validate required scaffold folders, templates, and runtime docs. Optionally create missing directories.")
    def validate_structure(auto_fix: bool = False) -> ValidationReport:
        return runtime.validator.validate(auto_fix=auto_fix)

    @mcp.tool(description="Generate a compact manifest of the repository surfaces, scripts, skills, and tool catalog.")
    def generate_manifest() -> RepoManifest:
        return runtime.generate_manifest()

    @mcp.tool(description="Archive one or more repository paths into .agents/z-arq/<timestamp>_<slug> with undo support.")
    def archive_paths(paths: list[str], slug: str, reason: str = "archive for safe organization") -> ArchiveResult:
        return runtime.changes.archive_paths(relative_paths=paths, slug=slug, reason=reason)

    @mcp.tool(description="Write or replace a text file inside the repository with journaling and undo support.")
    def write_text_file(path: str, content: str, reason: str) -> FileWriteResult:
        return runtime.changes.write_text_file(relative_path=path, content=content, reason=reason)

    @mcp.tool(description="Apply a unified diff to one file with automatic backup and undo support.")
    def apply_unified_diff(path: str, diff: str, reason: str) -> FileWriteResult:
        return runtime.changes.apply_unified_diff(relative_path=path, diff_text=diff, reason=reason)

    @mcp.tool(description="Undo the latest archived, written, or patched change recorded by this MCP.")
    def undo_last_change() -> UndoResult:
        return runtime.undo_last_change()

    @mcp.resource("repo://manifest", name="Repository manifest", mime_type="application/json")
    def repo_manifest_resource() -> str:
        return runtime.generate_manifest().model_dump_json(indent=2)

    @mcp.resource("repo://validation", name="Validation snapshot", mime_type="application/json")
    def validation_resource() -> str:
        return runtime.validator.validate(auto_fix=False).model_dump_json(indent=2)

    @mcp.resource("repo://tool-catalog", name="Tool catalog summary", mime_type="application/json")
    def tool_catalog_resource() -> str:
        import json
        return json.dumps(runtime.tool_catalog_resource(), indent=2, ensure_ascii=False)

    @mcp.resource("repo://command-registry", name="Runtime command registry", mime_type="application/json")
    def command_registry_resource() -> str:
        import json
        return json.dumps(runtime.command_registry_resource(), indent=2, ensure_ascii=False)

    @mcp.prompt(description="Return a safe implementation checklist for a repository change.")
    def safe_refactor_plan(goal: str, constraints: str = "") -> str:
        return (
            f"Goal: {goal}\n"
            f"Constraints: {constraints or 'Keep diff small, preserve docs/arc vs docs/map boundaries, and use archive_paths before delete.'}\n\n"
            "Execution order:\n"
            "1. Call generate_manifest.\n"
            "2. Call search_docs for roadmap/spec/rules context.\n"
            "3. Call validate_structure.\n"
            "4. Prepare the smallest reversible change.\n"
            "5. Use write_text_file or apply_unified_diff only after the plan is explicit.\n"
            "6. Re-run validate_structure.\n"
            "7. Use undo_last_change if validation regresses."
        )

    return mcp


try:
    mcp = build_mcp()
except FileNotFoundError:
    mcp = FastMCP(name="agentic-runtime", instructions=INSTRUCTIONS, version="0.1.0")


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
