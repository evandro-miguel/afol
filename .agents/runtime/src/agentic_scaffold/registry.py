from __future__ import annotations

import argparse
import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

from agentic_scaffold.config import RuntimeConfig
from agentic_scaffold.process_utils import (
    DEFAULT_COMMAND_TIMEOUT_SECONDS,
    ProcessError,
    run_command,
)
from agentic_scaffold.services.search import KnowledgeDoc, KnowledgePullHit, KnowledgeSearchService


@dataclass(frozen=True)
class RuntimeCommand:
    name: str
    script_name: str
    description: str
    phase: str = "compatibility"
    alias_of: str | None = None


_PRIMARY_COMMAND_SPECS = (
    ("doctor", "agents-doctor.py", "Validate .agents structure and integrity.", ()),
    ("benchmark", "agents-benchmark.py", "Run controlled runtime-flow benchmark scenarios.", ()),
    ("new", "agents-new.py", "Create new governed workstreams.", ()),
    ("index", "agents-index.py", "Update specs and decision indexes.", ()),
    ("lint-docs", "agents-lint-docs.py", "Validate markdown docs consistency.", ("lint",)),
    ("status", "agents-status.py", "Show workstream status summary and artifact readiness.", ()),
    ("implement", "agents-implement.py", "Execute governed task transitions.", ()),
    ("review", "agents-review.py", "Review governed execution state.", ()),
    ("revert", "agents-revert.py", "Revert logical work units.", ()),
    ("session", "agents-session.py", "Catch up or close governed workbench sessions.", ()),
    ("structure-map", "agents-structure-map.py", "Generate project structure documentation.", ("map",)),
    ("repo-map", "agents-repo-map.py", "Generate or refresh docs/map codemap output.", ("codemap",)),
    ("sync", "sync-agent-docs.py", "Sync AGENTS.md runtime mirrors.", ()),
    ("verify-tasks", "verify-tasks.py", "Verify workbench task completion.", ("verify",)),
    ("wb-update", "agents-wb-update.py", "Update workbench metadata and evidence.", ("wb",)),
    ("tools", "agents-tools.py", "Discover and validate tool catalog entries.", ()),
    ("telemetry", "agents-telemetry.py", "Query and record telemetry.", ()),
    ("local-state", "agents-local-state.py", "Manage local state indexes and append-only event log.", ()),
    ("patterns", "agents-patterns.py", "Discover and apply reusable patterns.", ()),
    ("knowledge", "agents-knowledge.py", "Search and pull reusable workbench knowledge.", ()),
    ("memory", "agents-memory.py", "Emit governed external-memory MCP contracts.", ()),
    ("bootstrap", "agents-bootstrap.py", "Install the scaffold into another repository.", ()),
    ("scaffold-update", "agents-scaffold-update.py", "Update scaffold-owned .agents files from a verified allowlisted payload.", ()),
    ("skills-sync", "agents-skills-sync.py", "Sync project skills from universal-skills.", ()),
    ("fix-symlinks", "agents-fix-symlinks.py", "Repair symlinks with copy fallback.", ()),
)


def _build_command_registry() -> dict[str, RuntimeCommand]:
    registry: dict[str, RuntimeCommand] = {}
    for name, script_name, description, aliases in _PRIMARY_COMMAND_SPECS:
        phase = "native" if name == "status" else "compatibility"
        registry[name] = RuntimeCommand(name=name, script_name=script_name, description=description, phase=phase)
        for alias in aliases:
            registry[alias] = RuntimeCommand(
                name=alias,
                script_name=script_name,
                description=description,
                alias_of=name,
            )
    return registry


COMMAND_REGISTRY: dict[str, RuntimeCommand] = _build_command_registry()


def _load_script_module(script_path: Path) -> ModuleType:
    module_name = f"agentic_scaffold_{script_path.stem.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load runtime command script: {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_status_in_process(repo_root: Path, args: list[str]) -> int:
    script = repo_root / ".agents" / "scripts" / "agents-status.py"
    return _run_script_main_in_process(script, args)


def _run_session_catchup_in_process(repo_root: Path, args: list[str]) -> int:
    script = repo_root / ".agents" / "scripts" / "agents-session.py"
    return _run_script_main_in_process(script, args)


def _run_script_main_in_process(script: Path, args: list[str]) -> int:
    if not script.exists():
        raise FileNotFoundError(f"Registered command script not found: {script}")

    scripts_dir = script.parent
    scripts_dir_text = str(scripts_dir)
    added_sys_path = False
    if scripts_dir_text not in sys.path:
        sys.path.insert(0, scripts_dir_text)
        added_sys_path = True

    previous_argv = sys.argv
    try:
        module = _load_script_module(script)
        sys.argv = [script.name, *args]
        try:
            exit_code = module.main()
        except SystemExit as exc:
            return int(exc.code) if isinstance(exc.code, int) else 1
        return int(exit_code) if isinstance(exit_code, int) else 0
    finally:
        sys.argv = previous_argv
        if added_sys_path:
            try:
                sys.path.remove(scripts_dir_text)
            except ValueError:
                pass


def _run_knowledge_pull_in_process(config: RuntimeConfig, args: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="knowledge pull", description="pull a compact digest for a topic")
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--snippets", type=int, default=2)
    try:
        parsed_args = parser.parse_args(args)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 1

    search_service = KnowledgeSearchService(config.repo_root, config.search_roots)
    hits = search_service.pull(query=parsed_args.query, limit=parsed_args.limit, snippets=parsed_args.snippets)
    if not hits:
        print(f"No reusable knowledge found for '{parsed_args.query}'.")
        return 0

    print(f"# Knowledge Pull: {parsed_args.query}")
    print()
    for hit in hits:
        _emit_knowledge_pull_hit(config.repo_root, hit)
    return 0


def _run_knowledge_list_in_process(config: RuntimeConfig, args: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="knowledge list", description="list knowledge docs")
    parser.add_argument("--type", choices=sorted(KnowledgeSearchService.KNOWLEDGE_DOC_TYPES), help="filter by doc type")
    parser.add_argument("--limit", type=int, default=30)
    try:
        parsed_args = parser.parse_args(args)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 1

    search_service = KnowledgeSearchService(config.repo_root, config.search_roots)
    docs = search_service.list_knowledge_docs(doc_type=parsed_args.type, limit=parsed_args.limit)
    if not docs:
        print("No knowledge documents found.")
        return 0
    for doc in docs:
        print(f"{doc.doc_type:14} {doc.doc_id:55} {_repo_relative_path(config.repo_root, doc.path)}")
    return 0


def _run_knowledge_search_in_process(config: RuntimeConfig, args: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="knowledge search", description="search knowledge docs")
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=10)
    try:
        parsed_args = parser.parse_args(args)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 1

    search_service = KnowledgeSearchService(config.repo_root, config.search_roots)
    hits = search_service.search_knowledge_docs(query=parsed_args.query, limit=parsed_args.limit)
    if not hits:
        print(f"No knowledge matches for '{parsed_args.query}'.")
        return 0
    for score, doc in hits:
        _emit_knowledge_search_hit(config.repo_root, score=score, doc=doc)
    return 0


def _run_knowledge_show_in_process(config: RuntimeConfig, args: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="knowledge show", description="show one knowledge doc")
    parser.add_argument("reference", help="doc id or path")
    try:
        parsed_args = parser.parse_args(args)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 1

    search_service = KnowledgeSearchService(config.repo_root, config.search_roots)
    doc = search_service.resolve_knowledge_doc(parsed_args.reference)
    if doc is None:
        print(f"Knowledge document not found: {parsed_args.reference}")
        return 1
    print(f"id: {doc.doc_id}")
    print(f"type: {doc.doc_type}")
    print(f"path: {_repo_relative_path(config.repo_root, doc.path)}")
    print(f"title: {doc.title}")
    print()
    print(doc.path.read_text())
    return 0


def _run_knowledge_index_in_process(config: RuntimeConfig, args: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="knowledge index", description="generate knowledge index")
    try:
        parser.parse_args(args)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 1

    search_service = KnowledgeSearchService(config.repo_root, config.search_roots)
    result = search_service.index_knowledge_docs()
    if result.changed:
        print(f"\u2713 knowledge index updated: {result.path_label} ({result.doc_count} docs)")
        return 0
    print(f"= knowledge index unchanged: {result.path_label} ({result.doc_count} docs)")
    return 0


def _emit_knowledge_search_hit(repo_root: Path, score: int, doc: KnowledgeDoc) -> None:
    print(f"[{score}] {doc.doc_type} | {doc.doc_id}")
    print(f"  path: {_repo_relative_path(repo_root, doc.path)}")
    if doc.summary:
        print(f"  summary: {doc.summary}")


def _repo_relative_path(repo_root: Path, path: Path) -> str:
    return path.relative_to(repo_root).as_posix()


def _emit_knowledge_pull_hit(repo_root: Path, hit: KnowledgePullHit) -> None:
    doc = hit.doc
    print(f"- {doc.doc_id} ({doc.doc_type}, score={hit.score})")
    print(f"  path: {_repo_relative_path(repo_root, doc.path)}")
    if doc.summary:
        print(f"  summary: {doc.summary}")
    if hit.snippets:
        for snippet in hit.snippets:
            print(f"  snippet L{snippet.line_no}: {snippet.text}")
    print(f"  reuse: open with '.agents/agents knowledge show {doc.doc_id}' if deeper context is needed")


class RuntimeRegistry:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config

    def manifest(self) -> list[dict[str, str | None]]:
        return [
            {
                "name": command.name,
                "script_name": command.script_name,
                "description": command.description,
                "phase": command.phase,
                "alias_of": command.alias_of,
            }
            for command in COMMAND_REGISTRY.values()
        ]

    def help_manifest(self) -> list[dict[str, str | list[str]]]:
        aliases_by_primary: dict[str, list[str]] = {}
        for command in COMMAND_REGISTRY.values():
            if command.alias_of is not None:
                aliases_by_primary.setdefault(command.alias_of, []).append(command.name)

        return [
            {
                "name": command.name,
                "script_name": command.script_name,
                "description": command.description,
                "phase": command.phase,
                "aliases": aliases_by_primary.get(command.name, []),
            }
            for command in COMMAND_REGISTRY.values()
            if command.alias_of is None
        ]

    def run(self, command_name: str, args: list[str]) -> int:
        if command_name not in COMMAND_REGISTRY:
            print(f"Unknown runtime registry command: {command_name}", file=sys.stderr)
            return 127
        if command_name == "knowledge" and args:
            subcommand = args[0]
            subcommand_args = args[1:]
            if subcommand == "pull":
                return _run_knowledge_pull_in_process(self.config, subcommand_args)
            if subcommand == "list":
                return _run_knowledge_list_in_process(self.config, subcommand_args)
            if subcommand == "search":
                return _run_knowledge_search_in_process(self.config, subcommand_args)
            if subcommand == "show":
                return _run_knowledge_show_in_process(self.config, subcommand_args)
            if subcommand == "index":
                return _run_knowledge_index_in_process(self.config, subcommand_args)
        if command_name == "status":
            return _run_status_in_process(self.config.repo_root, args)
        if command_name == "session" and args and args[0] == "catchup":
            return _run_session_catchup_in_process(self.config.repo_root, args)
        command = COMMAND_REGISTRY[command_name]
        script = self.config.repo_root / ".agents" / "scripts" / command.script_name
        if not script.exists():
            raise FileNotFoundError(f"Registered command script not found: {script}")
        try:
            proc = run_command(
                [sys.executable, str(script), *args],
                cwd=self.config.repo_root,
                capture_output=True,
                check=False,
                timeout=DEFAULT_COMMAND_TIMEOUT_SECONDS,
            )
        except ProcessError as exc:
            print(f"Runtime command timed out: {exc}", file=sys.stderr)
            return 124
        if proc.stdout:
            sys.stdout.write(proc.stdout)
        if proc.stderr:
            sys.stderr.write(proc.stderr)
        return proc.returncode
