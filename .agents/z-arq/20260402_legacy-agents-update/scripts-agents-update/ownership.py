#!/usr/bin/env python3
"""
Ownership resolver for agentic system updates.
Determines whether a file is system, user, or hybrid based on ownership map.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set
from enum import Enum


class OwnershipType(Enum):
    """Types of file ownership."""

    SYSTEM = "system"
    USER = "user"
    HYBRID = "hybrid"


@dataclass
class OwnershipRule:
    """A single ownership rule."""

    path: str
    type: OwnershipType
    recursive: bool = True
    description: str = ""
    default: Optional[OwnershipType] = None
    exceptions: Optional[List[str]] = None
    system_defaults: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "OwnershipRule":
        """Create rule from dictionary."""
        return cls(
            path=data["path"],
            type=OwnershipType(data["type"]),
            recursive=data.get("recursive", True),
            description=data.get("description", ""),
            default=OwnershipType(data["default"]) if "default" in data else None,
            exceptions=data.get("exceptions"),
            system_defaults=data.get("system_defaults"),
        )


class OwnershipMap:
    """
    Ownership map for the agentic system.
    Determines which files are system-owned vs user-owned.
    """

    def __init__(self, rules: List[OwnershipRule], default_policy: OwnershipType):
        self.rules = sorted(rules, key=lambda r: len(r.path), reverse=True)
        self.default_policy = default_policy
        self._cache: Dict[str, OwnershipType] = {}

    @classmethod
    def load(cls, path: Path) -> "OwnershipMap":
        """Load ownership map from JSON file."""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        rules = [OwnershipRule.from_dict(r) for r in data.get("ownership_rules", [])]
        default = OwnershipType(data.get("default_policy", "user"))

        return cls(rules, default)

    def get_ownership(self, relative_path: str) -> OwnershipType:
        """
        Determine ownership of a path.

        Args:
            relative_path: Path relative to .agents/ directory

        Returns:
            OwnershipType for the path
        """
        # Check cache
        if relative_path in self._cache:
            return self._cache[relative_path]

        # Find matching rule (most specific first due to sorting)
        for rule in self.rules:
            if self._matches(relative_path, rule):
                result = self._resolve_ownership(relative_path, rule)
                self._cache[relative_path] = result
                return result

        # Default policy
        self._cache[relative_path] = self.default_policy
        return self.default_policy

    def _matches(self, path: str, rule: OwnershipRule) -> bool:
        """Check if a path matches a rule."""
        rule_path = rule.path.rstrip("/")

        # Direct match
        if path == rule_path:
            return True

        # Recursive match
        if rule.recursive and path.startswith(rule_path + "/"):
            return True

        return False

    def _resolve_ownership(self, path: str, rule: OwnershipRule) -> OwnershipType:
        """Resolve ownership considering exceptions and defaults."""
        # Check exceptions first
        if rule.exceptions:
            for exc in rule.exceptions:
                if path.startswith(exc.rstrip("/")):
                    # Exception found - check if it's a rule
                    for exc_rule in self.rules:
                        if exc_rule.path == exc:
                            return self._resolve_ownership(path, exc_rule)
                    # No specific rule for exception, use default
                    return OwnershipType.USER

        # Handle hybrid types
        if rule.type == OwnershipType.HYBRID:
            return rule.default or OwnershipType.USER

        return rule.type

    def is_system(self, path: str) -> bool:
        """Check if path is system-owned."""
        return self.get_ownership(path) == OwnershipType.SYSTEM

    def is_user(self, path: str) -> bool:
        """Check if path is user-owned."""
        return self.get_ownership(path) == OwnershipType.USER

    def is_updatable(self, path: str) -> bool:
        """Check if path can be updated."""
        return self.is_system(path)

    def get_system_paths(self) -> Set[str]:
        """Get all paths that are system-owned."""
        paths = set()
        for rule in self.rules:
            if rule.type == OwnershipType.SYSTEM:
                paths.add(rule.path)
        return paths

    def get_user_paths(self) -> Set[str]:
        """Get all paths that are user-owned."""
        paths = set()
        for rule in self.rules:
            if rule.type == OwnershipType.USER:
                paths.add(rule.path)
        return paths

    def categorize_paths(self, paths: List[str]) -> Dict[str, List[str]]:
        """
        Categorize a list of paths by ownership.

        Returns:
            Dict with 'system', 'user', 'hybrid' keys
        """
        result = {"system": [], "user": [], "hybrid": []}

        for path in paths:
            ownership = self.get_ownership(path)
            result[ownership.value].append(path)

        return result


def load_default_ownership_map(agents_dir: Path) -> OwnershipMap:
    """Load the default ownership map from .agents/update-ownership.json."""
    ownership_path = agents_dir / "update-ownership.json"

    if not ownership_path.exists():
        raise FileNotFoundError(
            f"Ownership map not found: {ownership_path}\n"
            "Run 'agents-update init' to create default map."
        )

    return OwnershipMap.load(ownership_path)


def create_default_ownership_map() -> dict:
    """Create default ownership map structure."""
    return {
        "schema_version": 1,
        "description": "Ownership map for agentic system update",
        "ownership_rules": [
            {
                "path": "scripts",
                "type": "system",
                "recursive": True,
                "description": "Python operational scripts",
            },
            {
                "path": "wb",
                "type": "user",
                "recursive": True,
                "description": "Workbench sessions - NEVER touch",
            },
            {
                "path": "arc/SPECS",
                "type": "user",
                "recursive": True,
                "description": "User specifications",
            },
            {
                "path": "arc/DECISIONS",
                "type": "user",
                "recursive": True,
                "description": "User architecture decisions",
            },
            {
                "path": "a-docs/lessons",
                "type": "user",
                "recursive": True,
                "description": "User lessons learned",
            },
            {
                "path": "skills",
                "type": "hybrid",
                "recursive": True,
                "default": "user",
                "exceptions": ["skills/core"],
                "description": "Skills - core is system, rest is user",
            },
            {
                "path": "skills/core",
                "type": "system",
                "recursive": True,
                "description": "Core system skills",
            },
        ],
        "default_policy": "user",
    }


if __name__ == "__main__":
    # Test ownership map
    test_data = create_default_ownership_map()

    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(test_data, f, indent=2)
        temp_path = Path(f.name)

    try:
        ownership = OwnershipMap.load(temp_path)

        # Test various paths
        test_paths = [
            "scripts/agents-doctor.py",
            "wb/260223_test/plan.md",
            "arc/SPECS/spec.md",
            "a-docs/lessons/lesson.md",
            "skills/core/my-skill/SKILL.md",
            "skills/local/my-skill/SKILL.md",
            "data/config.json",
            "unknown/file.txt",
        ]

        print("Ownership tests:")
        for path in test_paths:
            owner = ownership.get_ownership(path)
            updatable = "✓" if ownership.is_updatable(path) else "✗"
            print(f"  {updatable} {path}: {owner.value}")
    finally:
        temp_path.unlink()
