from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from agentic_scaffold.runtime import AgenticRuntime
from agentic_scaffold.server import build_mcp

app = typer.Typer(add_completion=False, no_args_is_help=True)
console = Console()


def _runtime(repo_root: Optional[Path]) -> AgenticRuntime:
    return AgenticRuntime.from_repo_root(repo_root)


@app.command()
def inspect(
    depth: int = typer.Option(3, min=0, max=8),
    include_hidden: bool = False,
    max_entries: int = typer.Option(500, min=50, max=5000),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Inspect the workspace tree."""
    result = _runtime(repo_root).workspace.inspect(depth=depth, include_hidden=include_hidden, max_entries=max_entries)
    console.print_json(data=result.model_dump(mode="json"))


@app.command()
def search(
    query: str,
    limit: int = typer.Option(8, min=1, max=50),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Search scaffold docs and workbench artifacts."""
    result = _runtime(repo_root).search.search(query=query, limit=limit)
    console.print_json(data=result.model_dump(mode="json"))


@app.command()
def validate(
    auto_fix: bool = False,
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Validate the scaffold structure."""
    result = _runtime(repo_root).validator.validate(auto_fix=auto_fix)
    console.print_json(data=result.model_dump(mode="json"))
    raise typer.Exit(code=0 if result.ok else 1)


@app.command()
def manifest(repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True)) -> None:
    """Generate the compact repository manifest."""
    result = _runtime(repo_root).generate_manifest()
    console.print_json(data=result.model_dump(mode="json"))


@app.command()
def archive(
    paths: list[str] = typer.Argument(..., help="Relative repository paths to archive."),
    slug: str = typer.Option(..., help="Archive slug, ex: stale-docs"),
    reason: str = typer.Option("archive for safe organization"),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Archive repository paths safely."""
    result = _runtime(repo_root).changes.archive_paths(relative_paths=paths, slug=slug, reason=reason)
    console.print_json(data=result.model_dump(mode="json"))


@app.command()
def write(
    path: str,
    content_file: Path = typer.Option(..., exists=True, file_okay=True, dir_okay=False),
    reason: str = typer.Option(...),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Write text content from a file into a repository path."""
    content = content_file.read_text(encoding="utf-8")
    result = _runtime(repo_root).changes.write_text_file(relative_path=path, content=content, reason=reason)
    console.print_json(data=result.model_dump(mode="json"))


@app.command("patch")
def patch_command(
    path: str,
    diff_file: Path = typer.Option(..., exists=True, file_okay=True, dir_okay=False),
    reason: str = typer.Option(...),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Apply a unified diff from a file."""
    diff_text = diff_file.read_text(encoding="utf-8")
    result = _runtime(repo_root).changes.apply_unified_diff(relative_path=path, diff_text=diff_text, reason=reason)
    console.print_json(data=result.model_dump(mode="json"))


@app.command()
def undo(repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True)) -> None:
    """Undo the latest change created by this MCP runtime."""
    result = _runtime(repo_root).undo_last_change()
    console.print_json(data=result.model_dump(mode="json"))
    raise typer.Exit(code=0 if result.ok else 1)


@app.command()
def serve(repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True)) -> None:
    """Run the FastMCP server using stdio transport."""
    build_mcp(repo_root).run()


@app.command()
def inspect_config(repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True)) -> None:
    runtime = _runtime(repo_root)
    payload = {
        "repo_root": str(runtime.config.repo_root),
        "search_roots": [str(path) for path in runtime.config.search_roots],
        "write_blocklist": list(runtime.config.write_blocklist),
        "archive_root": str(runtime.config.archive_root),
        "journal_root": str(runtime.config.journal_root),
    }
    console.print_json(data=payload)


def _run_registered(command_name: str, args: list[str], repo_root: Optional[Path]) -> None:
    exit_code = _runtime(repo_root).registry.run(command_name, args)
    raise typer.Exit(code=exit_code)


REGISTRY_COMMAND_CONTEXT = {"allow_extra_args": True, "ignore_unknown_options": True, "help_option_names": []}


@app.command(context_settings=REGISTRY_COMMAND_CONTEXT)
def run(
    ctx: typer.Context,
    command_name: str,
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Run a public .agents command through the runtime registry."""
    _run_registered(command_name, list(ctx.args), repo_root)


@app.command(context_settings=REGISTRY_COMMAND_CONTEXT)
def status(
    ctx: typer.Context,
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Run the registry-backed status command."""
    _run_registered("status", list(ctx.args), repo_root)


@app.command(context_settings=REGISTRY_COMMAND_CONTEXT)
def knowledge(
    ctx: typer.Context,
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Run the registry-backed knowledge command."""
    _run_registered("knowledge", list(ctx.args), repo_root)


@app.command(context_settings=REGISTRY_COMMAND_CONTEXT)
def session(
    ctx: typer.Context,
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Run the registry-backed session command."""
    _run_registered("session", list(ctx.args), repo_root)


@app.command("command-registry")
def command_registry(repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True)) -> None:
    """Show runtime registry commands."""
    console.print_json(data=_runtime(repo_root).command_registry_resource())



def main() -> None:
    app()


if __name__ == "__main__":
    main()
