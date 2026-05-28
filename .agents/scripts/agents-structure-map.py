#!/usr/bin/env python3
"""
Agents Structure Map - Auto-generate project structure documentation.

Scans a project directory and generates markdown documentation with:
- File inventory by category
- Line counts and file sizes
- Descriptions for each file
- Incremental updates via cache

Usage:
    python agents-structure-map.py <project-path> [--output <output-dir>]

Examples:
    python agents-structure-map.py .
    python agents-structure-map.py /path/to/my-project --output docs/map/structure/
"""

import os
import sys
import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any
from dataclasses import dataclass, asdict

from lib.agents_config import get_cfg_path, load_agents_config, parse_offset

# Configuration
DEFAULT_SECTIONS = {
    "frontend": {
        "patterns": ["components", "hooks", "pages", "views", "ui", "screens", "layouts", "features"],
        "extensions": [".tsx", ".jsx", ".vue", ".svelte"],
        "title": "Frontend",
        "description": "React components, hooks, and UI elements",
    },
    "backend": {
        "patterns": ["services", "api", "controllers", "routes", "handlers", "utils", "lib", "core", "domain"],
        "extensions": [".ts", ".js", ".py", ".go", ".rs", ".java"],
        "title": "Backend",
        "description": "Services, utilities, and business logic",
    },
    "types": {
        "patterns": ["types", "interfaces", "models", "schemas", "entities"],
        "extensions": [".ts", ".tsx", ".d.ts"],
        "title": "Types",
        "description": "Type definitions and interfaces",
    },
    "tests": {
        "patterns": ["tests", "specs", "__tests__", "e2e", "integration"],
        "extensions": [".test.ts", ".test.tsx", ".test.js", ".spec.ts", ".spec.tsx", ".test.py"],
        "title": "Tests",
        "description": "Unit tests, integration tests, and E2E tests",
    },
    "data": {
        "patterns": ["data", "constants", "config", "fixtures", "mocks"],
        "extensions": [".json", ".ts", ".js"],
        "title": "Data",
        "description": "Data files, constants, and configuration",
    },
}

CACHE_FILE = ".structure-cache.json"
ALLOWED_HIDDEN_DIRS = {".agents", ".agent", ".github"}
IGNORED_DIRS = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    "target",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".cache",
    "cache",
    "source",
    "tmp",
    "wb",
    "z-arq",
}
IGNORED_PATH_SUFFIXES = {
    ".agents/tools/uv",
}
IGNORED_RELATIVE_PATHS = {
    ".agents/data/telemetry/events.jsonl",
    "src/project-template/.agents/data/telemetry/events.jsonl",
}

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
MAP_DIR = get_cfg_path(ROOT_DIR, CONFIG, "map_dir")
DEFAULT_OUTPUT_DIR = MAP_DIR / "structure"
DEFAULT_OFFSET = CONFIG.get("time", {}).get("default_offset", "+00:00")
DEFAULT_TZ = parse_offset(DEFAULT_OFFSET)


@dataclass
class FileInfo:
    path: str
    relative_path: str
    lines: int
    size_kb: float
    extension: str
    section: str
    description: str = ""
    hash: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> 'FileInfo':
        return cls(**data)


@dataclass
class SectionStats:
    name: str
    title: str
    description: str
    files: List[FileInfo]
    total_lines: int
    total_size_kb: float

    def to_dict(self) -> dict:
        return {
            **asdict(self),
            'files': [f.to_dict() for f in self.files]
        }


class StructureMapper:
    def __init__(
        self,
        project_path: Path,
        output_path: Path,
        cache_enabled: bool = True,
        verbose: bool = False,
    ):
        self.project_path = project_path.resolve()
        self.output_path = output_path.resolve()
        self.cache_enabled = cache_enabled
        self.verbose = verbose
        self.cache: Dict[str, Any] = {}
        self.stats: Dict[str, int] = {
            "total_files": 0,
            "total_lines": 0,
            "sections": {},
        }

    def load_cache(self):
        """Load existing cache if available."""
        cache_file = self.output_path / CACHE_FILE
        if cache_file.exists() and self.cache_enabled:
            try:
                self.cache = json.loads(cache_file.read_text())
                if self.verbose:
                    print(f"✓ Loaded cache: {len(self.cache.get('files', {}))} entries")
            except Exception as e:
                if self.verbose:
                    print(f"⚠️  Cache load failed: {e}")
                self.cache = {}

    def save_cache(self):
        """Save cache for incremental updates."""
        if not self.cache_enabled:
            return

        cache_file = self.output_path / CACHE_FILE
        tmp_file = cache_file.with_name(f".{cache_file.name}.tmp")
        tmp_file.write_text(json.dumps(self.cache, indent=2))
        os.replace(tmp_file, cache_file)
        if self.verbose:
            print(f"✓ Saved cache: {len(self.cache.get('files', {}))} entries")

    def compute_file_hash(self, file_path: Path) -> str:
        """Compute hash of file content for change detection."""
        try:
            content = file_path.read_text(errors='ignore')
            return hashlib.md5(content.encode()).hexdigest()
        except Exception:
            return ""

    def count_lines(self, file_path: Path) -> int:
        """Count non-empty lines in file."""
        try:
            content = file_path.read_text(errors='ignore')
            return len([line for line in content.splitlines() if line.strip()])
        except Exception:
            return 0

    def get_file_size_kb(self, file_path: Path) -> float:
        """Get file size in KB."""
        try:
            return file_path.stat().st_size / 1024
        except Exception:
            return 0.0

    def collect_file_metrics(self, file_path: Path) -> tuple[int, float, str]:
        """Read a file once and derive line count, size, and content hash."""
        try:
            raw = file_path.read_bytes()
        except Exception:
            return 0, 0.0, ""

        size_kb = len(raw) / 1024
        file_hash = hashlib.md5(raw).hexdigest()
        text = raw.decode(errors="ignore")
        lines = sum(1 for line in text.splitlines() if line.strip())
        return lines, size_kb, file_hash

    def classify_file(self, rel_path: str, extension: str) -> str:
        """Classify file into a section based on path and extension."""
        rel_path_lower = rel_path.lower()

        # Check tests first (highest priority)
        for pattern in DEFAULT_SECTIONS["tests"]["patterns"]:
            if pattern in rel_path_lower:
                return "tests"

        # Check type definitions
        for pattern in DEFAULT_SECTIONS["types"]["patterns"]:
            if pattern in rel_path_lower and extension in [".ts", ".tsx", ".d.ts"]:
                return "types"

        # Check frontend
        for pattern in DEFAULT_SECTIONS["frontend"]["patterns"]:
            if pattern in rel_path_lower and extension in DEFAULT_SECTIONS["frontend"]["extensions"]:
                return "frontend"

        # Check backend
        for pattern in DEFAULT_SECTIONS["backend"]["patterns"]:
            if pattern in rel_path_lower and extension in DEFAULT_SECTIONS["backend"]["extensions"]:
                return "backend"

        # Check data
        for pattern in DEFAULT_SECTIONS["data"]["patterns"]:
            if pattern in rel_path_lower:
                return "data"

        # Default: backend for code, skip others
        if extension in [".ts", ".js", ".py", ".go", ".rs", ".java"]:
            return "backend"

        return ""  # Skip this file

    def generate_description(self, file_info: FileInfo) -> str:
        """Generate a brief description for a file."""
        name = Path(file_info.relative_path).stem

        # Heuristic descriptions based on naming patterns
        if name.endswith('View'):
            return "View component; view component (stateful)"
        elif name.endswith('Page'):
            return "Page component; view component (stateful)"
        elif name.endswith('Controller'):
            return "Controller; handles business logic (stateful)"
        elif name.endswith('Service'):
            return "Service; external API integration"
        elif name.endswith('Hook') or name.startswith('use'):
            return "Custom hook; reusable logic"
        elif name.endswith('Model'):
            return "Data model; schema definition"
        elif name.endswith('Schema'):
            return "Schema; validation rules"
        elif name.endswith('Config') or name.endswith('Constants'):
            return "Configuration; constants and settings"
        elif 'test' in name.lower() or name.endswith('.test'):
            return "Test file; unit tests"
        elif name.endswith('Utils') or name.endswith('Helpers'):
            return "Utilities; helper functions"
        elif name.endswith('Types') or name.endswith('Interfaces'):
            return "Type definitions; interfaces and types"
        else:
            return "Module; functionality"

    def scan_files(self) -> Dict[str, SectionStats]:
        """Scan all files in project."""
        print(f"scanning: {self.project_path}")

        sections: Dict[str, List[FileInfo]] = {name: [] for name in DEFAULT_SECTIONS}
        next_cache: Dict[str, Any] = {}
        prune_output_subtree = False
        if self.output_path != self.project_path:
            try:
                self.output_path.relative_to(self.project_path)
                prune_output_subtree = True
            except ValueError:
                prune_output_subtree = False

        # Walk through project directory
        for root, dirs, files in os.walk(self.project_path):
            root_path = Path(root).resolve()
            if prune_output_subtree:
                try:
                    root_path.relative_to(self.output_path)
                    dirs[:] = []
                    continue
                except ValueError:
                    pass

            rel_root = root_path.relative_to(self.project_path)
            # Keep selected hidden dirs like .agents, while ignoring common heavy/cache dirs.
            dirs[:] = [
                d for d in dirs
                if (not d.startswith(".") or d in ALLOWED_HIDDEN_DIRS)
                and d not in IGNORED_DIRS
                and (rel_root / d).as_posix() not in IGNORED_PATH_SUFFIXES
                and (not prune_output_subtree or (root_path / d).resolve() != self.output_path)
            ]

            for file in files:
                file_path = Path(root) / file
                rel_path = str(file_path.relative_to(self.project_path)).replace("\\", "/")
                if rel_path in IGNORED_RELATIVE_PATHS:
                    continue
                extension = file_path.suffix.lower()

                # Classify file
                section = self.classify_file(rel_path, extension)
                if not section:
                    continue

                # Get file info
                lines, size_kb, file_hash = self.collect_file_metrics(file_path)

                # Check cache for existing description
                cache_key = rel_path
                cached = self.cache.get('files', {}).get(cache_key)

                if cached and cached.get('hash') == file_hash:
                    # Use cached description
                    description = cached.get('description', '')
                else:
                    # Generate new description
                    description = self.generate_description(FileInfo(
                        path=str(file_path),
                        relative_path=rel_path,
                        lines=lines,
                        size_kb=size_kb,
                        extension=extension,
                        section=section
                    ))

                    # Update cache
                next_cache[cache_key] = {
                    'hash': file_hash,
                    'description': description,
                    'section': section,
                }

                file_info = FileInfo(
                    path=str(file_path),
                    relative_path=rel_path,
                    lines=lines,
                    size_kb=size_kb,
                    extension=extension,
                    section=section,
                    description=description,
                    hash=file_hash
                )

                sections[section].append(file_info)
                self.stats["total_files"] += 1
                self.stats["total_lines"] += lines
                self.stats["sections"][section] = self.stats["sections"].get(section, 0) + 1

        self.cache['files'] = next_cache

        # Build section stats
        result = {}
        for name, files in sections.items():
            if not files:
                continue

            config = DEFAULT_SECTIONS[name]
            result[name] = SectionStats(
                name=name,
                title=config["title"],
                description=config["description"],
                files=sorted(files, key=lambda f: f.lines, reverse=True),
                total_lines=sum(f.lines for f in files),
                total_size_kb=sum(f.size_kb for f in files)
            )

        return result

    def generate_readme(self, sections: Dict[str, SectionStats]) -> str:
        """Generate main README.md for structure folder."""
        timestamp = datetime.now(DEFAULT_TZ).strftime(f"%Y-%m-%dT%H:%M:%S{DEFAULT_OFFSET}")
        return self.generate_readme_with_timestamp(sections, timestamp)

    def generate_readme_with_timestamp(self, sections: Dict[str, SectionStats], timestamp: str) -> str:
        """Generate README with an explicit generated timestamp."""

        content = f"""# 📁 Project Structure - Complete Index

**Generated:** {timestamp}
**Last Update:** First run

## 📊 Overview

| Metric | Value |
|--------|-------|
| **Total Files** | {self.stats['total_files']} |
| **Total Lines** | {self.stats['total_lines']:,} |

## 📂 Documentation Sections

| Section | Description | Files |
|---------|-------------|-------|
"""

        for name, stats in sections.items():
            content += f"| [{stats.title}](./{name}.md) | {stats.description} | {len(stats.files)} |\n"

        content += f"""
## 🔄 Change Detection

This documentation uses **incremental updates**:
- ✅ Descriptions cached to avoid regenerating everything
- ✅ Only new/changed files get new descriptions
- ✅ Detects when file purpose changes

## 🌳 Quick Directory Tree

```
{self.project_path.name}/
"""

        # Add top-level directories
        top_dirs = sorted([d for d in self.project_path.iterdir() if d.is_dir() and not d.name.startswith('.')])[:10]
        for d in top_dirs:
            content += f"├── 📁 {d.name}/\n"

        content += """```

---

*Generated automatically by `agents-structure-map.py`*
*For detailed structure, see individual section files*
"""

        return content

    def generate_section_md(self, stats: SectionStats) -> str:
        """Generate markdown for a section."""
        timestamp = datetime.now(DEFAULT_TZ).strftime(f"%Y-%m-%dT%H:%M:%S{DEFAULT_OFFSET}")
        return self.generate_section_md_with_timestamp(stats, timestamp)

    def generate_section_md_with_timestamp(self, stats: SectionStats, timestamp: str) -> str:
        """Generate section markdown with an explicit generated timestamp."""

        content = f"""# 🎨 {stats.title} Structure

**Generated:** {timestamp}
**Last Update:** First run

{stats.description}.

---

## 📁 Directory Overview

**Stats:** {len(stats.files)} files, {stats.total_lines:,} lines, {stats.total_size_kb:.1f} KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
"""

        for file_info in stats.files:
            display_path = file_info.relative_path.replace('\\', '/')
            content += f"| `{display_path}` | {file_info.lines:,} | {file_info.size_kb:.1f} KB | {file_info.description} |\n"

        content += """
---
*Generated by `agents-structure-map.py`*
"""

        return content

    @staticmethod
    def extract_generated_timestamp(content: str | None) -> str | None:
        if not content:
            return None
        for line in content.splitlines():
            if line.startswith("**Generated:** "):
                return line.removeprefix("**Generated:** ").strip()
        return None

    def write_generated_doc(
        self,
        path: Path,
        render_with_timestamp,
        *,
        summary_label: str,
    ) -> bool:
        now_ts = datetime.now(DEFAULT_TZ).strftime(f"%Y-%m-%dT%H:%M:%S{DEFAULT_OFFSET}")
        previous = path.read_text() if path.exists() else ""
        preserved_ts = self.extract_generated_timestamp(previous) or now_ts
        stable_content = render_with_timestamp(preserved_ts)

        if previous == stable_content:
            if self.verbose:
                print(f"= Unchanged: {summary_label}")
            return False

        next_content = render_with_timestamp(now_ts)
        if previous == next_content:
            if self.verbose:
                print(f"= Unchanged: {summary_label}")
            return False

        path.write_text(next_content)
        if self.verbose:
            print(f"✓ Created: {summary_label}")
        return True

    def run(self):
        """Run the structure mapping process."""
        # Load cache
        self.load_cache()

        # Scan files
        sections = self.scan_files()

        if not sections:
            print("⚠️  No files found to document")
            return

        # Create output directory
        self.output_path.mkdir(parents=True, exist_ok=True)

        # Generate README
        readme_path = self.output_path / "README.md"
        self.write_generated_doc(
            readme_path,
            lambda ts: self.generate_readme_with_timestamp(sections, ts),
            summary_label=str(readme_path.relative_to(self.project_path)),
        )

        # Generate section files
        for name, stats in sections.items():
            section_path = self.output_path / f"{name}.md"
            self.write_generated_doc(
                section_path,
                lambda ts, stats=stats: self.generate_section_md_with_timestamp(stats, ts),
                summary_label=str(section_path.relative_to(self.project_path)),
            )

        # Save cache
        self.save_cache()

        # Print summary
        print(
            "structure_map: "
            f"files={self.stats['total_files']} lines={self.stats['total_lines']} "
            f"sections={len(self.stats['sections'])} output={self.output_path}"
        )
        for name, count in sorted(self.stats["sections"].items(), key=lambda x: x[1], reverse=True):
            print(f" - {name}: {count}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python agents-structure-map.py <project-path> [--output <output-dir>]")
        print()
        print("Examples:")
        print("  python agents-structure-map.py .")
        print("  python agents-structure-map.py /path/to/my-project --output docs/map/structure/")
        sys.exit(1)

    project_path = Path(sys.argv[1])

    # Parse output path
    output_path = None
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_path = Path(sys.argv[idx + 1])
    verbose = "--verbose" in sys.argv

    # Default output path
    if not output_path:
        if project_path.resolve() == ROOT_DIR.resolve():
            output_path = DEFAULT_OUTPUT_DIR
        else:
            output_path = project_path / "docs" / "map" / "structure"

    # Run mapper
    mapper = StructureMapper(project_path, output_path, verbose=verbose)
    mapper.run()


if __name__ == "__main__":
    main()
