from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass

from agentic_scaffold.config import RuntimeConfig


@dataclass(frozen=True)
class RuntimeCommand:
    name: str
    script_name: str
    description: str
    phase: str = "compatibility"
    alias_of: str | None = None


_PRIMARY_COMMAND_SPECS = (
    ("doctor", "agents-doctor.py", "Validate .agents structure and integrity.", ()),
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
    ("patterns", "agents-patterns.py", "Discover and apply reusable patterns.", ()),
    ("knowledge", "agents-knowledge.py", "Search and pull reusable workbench knowledge.", ()),
    ("memory", "agents-memory.py", "Emit governed external-memory MCP contracts.", ()),
    ("bootstrap", "agents-bootstrap.py", "Install the scaffold into another repository.", ()),
    ("skills-sync", "agents-skills-sync.py", "Sync project skills from universal-skills.", ()),
    ("fix-symlinks", "agents-fix-symlinks.py", "Repair symlinks with copy fallback.", ()),
)


def _build_command_registry() -> dict[str, RuntimeCommand]:
    registry: dict[str, RuntimeCommand] = {}
    for name, script_name, description, aliases in _PRIMARY_COMMAND_SPECS:
        registry[name] = RuntimeCommand(name=name, script_name=script_name, description=description)
        for alias in aliases:
            registry[alias] = RuntimeCommand(
                name=alias,
                script_name=script_name,
                description=description,
                alias_of=name,
            )
    return registry


COMMAND_REGISTRY: dict[str, RuntimeCommand] = _build_command_registry()


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
        command = COMMAND_REGISTRY[command_name]
        script = self.config.repo_root / ".agents" / "scripts" / command.script_name
        if not script.exists():
            raise FileNotFoundError(f"Registered command script not found: {script}")
        proc = subprocess.run(
            [sys.executable, str(script), *args],
            cwd=self.config.repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.stdout:
            sys.stdout.write(proc.stdout)
        if proc.stderr:
            sys.stderr.write(proc.stderr)
        return proc.returncode
