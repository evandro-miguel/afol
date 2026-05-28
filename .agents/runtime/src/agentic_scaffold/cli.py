from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer

from agentic_scaffold.runtime import AgenticRuntime

app = typer.Typer(add_completion=False, no_args_is_help=True)
INSPECT_ACTION_SPEC = AgenticRuntime.require_action_spec("inspect")
HEALTH_ACTION_SPEC = AgenticRuntime.require_action_spec("health")


def _runtime(repo_root: Optional[Path]) -> AgenticRuntime:
    return AgenticRuntime.from_repo_root(repo_root)


def _emit_json(payload: object, pretty: bool = False) -> None:
    indent = 2 if pretty else None
    separators = None if pretty else (",", ":")
    typer.echo(json.dumps(payload, ensure_ascii=False, indent=indent, separators=separators))


@app.command(name=INSPECT_ACTION_SPEC.cli_command)
def inspect(
    depth: int = 3,
    include_hidden: bool = False,
    include_generated: bool = False,
    max_entries: int = typer.Option(500),
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Inspect the workspace tree."""
    result = _runtime(repo_root).run_action(
        INSPECT_ACTION_SPEC.action_id,
        depth=depth,
        include_hidden=include_hidden,
        include_generated=include_generated,
        max_entries=max_entries,
    )
    if result.status == "error":
        _emit_json({"status": result.status, "message": result.message}, pretty=pretty)
        raise typer.Exit(code=1)
    _emit_json(result.payload, pretty=pretty)


@app.command(name=HEALTH_ACTION_SPEC.cli_command)
def health(
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Run minimal runtime health checks."""
    result = _runtime(repo_root).run_action(HEALTH_ACTION_SPEC.action_id)
    if result.status == "error":
        _emit_json({"status": result.status, "message": result.message, "payload": result.payload}, pretty=pretty)
        raise typer.Exit(code=1)
    _emit_json(result.payload, pretty=pretty)


@app.command()
def search(
    query: str,
    limit: int = typer.Option(8, min=1, max=50),
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Search scaffold docs and workbench artifacts."""
    result = _runtime(repo_root).search.search(query=query, limit=limit)
    _emit_json(result.model_dump(mode="json"), pretty=pretty)


@app.command()
def validate(
    auto_fix: bool = False,
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Validate the scaffold structure."""
    result = _runtime(repo_root).validator.validate(auto_fix=auto_fix)
    _emit_json(result.model_dump(mode="json"), pretty=pretty)
    raise typer.Exit(code=0 if result.ok else 1)


@app.command()
def manifest(
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Generate the compact repository manifest."""
    result = _runtime(repo_root).generate_manifest()
    _emit_json(result.model_dump(mode="json"), pretty=pretty)


@app.command("inspect-target")
def inspect_target(
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Inspect the target repo for adoption readiness signals."""
    result = _runtime(repo_root).adoption.inspect()
    _emit_json(result.model_dump(mode="json"), pretty=pretty)


@app.command("adoption-plan")
def adoption_plan(
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Generate a non-destructive scaffold update plan for an existing repo."""
    result = _runtime(repo_root).adoption.plan()
    _emit_json(result.model_dump(mode="json"), pretty=pretty)


@app.command()
def archive(
    paths: list[str] = typer.Argument(..., help="Relative repository paths to archive."),
    slug: str = typer.Option(..., help="Archive slug, ex: stale-docs"),
    reason: str = typer.Option("archive for safe organization"),
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Archive repository paths safely."""
    result = _runtime(repo_root).changes.archive_paths(relative_paths=paths, slug=slug, reason=reason)
    _emit_json(result.model_dump(mode="json"), pretty=pretty)


@app.command()
def write(
    path: str,
    content_file: Path = typer.Option(..., exists=True, file_okay=True, dir_okay=False),
    reason: str = typer.Option(...),
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Write text content from a file into a repository path."""
    content = content_file.read_text(encoding="utf-8")
    result = _runtime(repo_root).changes.write_text_file(relative_path=path, content=content, reason=reason)
    _emit_json(result.model_dump(mode="json"), pretty=pretty)


@app.command("patch")
def patch_command(
    path: str,
    diff_file: Path = typer.Option(..., exists=True, file_okay=True, dir_okay=False),
    reason: str = typer.Option(...),
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Apply a unified diff from a file."""
    diff_text = diff_file.read_text(encoding="utf-8")
    result = _runtime(repo_root).changes.apply_unified_diff(relative_path=path, diff_text=diff_text, reason=reason)
    _emit_json(result.model_dump(mode="json"), pretty=pretty)


@app.command()
def undo(
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Undo the latest change created by this MCP runtime."""
    result = _runtime(repo_root).undo_last_change()
    _emit_json(result.model_dump(mode="json"), pretty=pretty)
    raise typer.Exit(code=0 if result.ok else 1)


@app.command()
def serve(repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True)) -> None:
    """Run the FastMCP server using stdio transport."""
    from agentic_scaffold.server import build_mcp

    build_mcp(repo_root).run()


@app.command()
def inspect_config(
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    runtime = _runtime(repo_root)
    payload = {
        "repo_root": str(runtime.config.repo_root),
        "search_roots": [str(path) for path in runtime.config.search_roots],
        "write_blocklist": list(runtime.config.write_blocklist),
        "archive_root": str(runtime.config.archive_root),
        "journal_root": str(runtime.config.journal_root),
    }
    _emit_json(payload, pretty=pretty)


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
def command_registry(
    pretty: bool = typer.Option(False, "--pretty", help="Emit human-readable JSON with indentation."),
    repo_root: Optional[Path] = typer.Option(None, exists=False, file_okay=False, dir_okay=True),
) -> None:
    """Show runtime registry commands."""
    runtime = _runtime(repo_root)
    payload = runtime.command_registry_resource()
    payload["help_commands"] = runtime.registry.help_manifest()
    _emit_json(payload, pretty=pretty)



def main() -> None:
    app()


if __name__ == "__main__":
    main()
