#!/usr/bin/env python3
"""
Agents Tools List - Display available tools with descriptions.

Shows all available .agents tools with their descriptions, types, and usage patterns.
Helps agents discover which tool to use for their current task.

Usage:
    python agents-tools.py list              # List all tools
    python agents-tools.py list --type validation  # Filter by type
    python agents-tools.py info <tool-id>    # Detailed info about a tool
    python agents-tools.py search <query>    # Search tools by description

Examples:
    python agents-tools.py list
    python agents-tools.py info doctor
    python agents-tools.py search validate
"""

import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Configuration
SCRIPT_DIR = Path(__file__).resolve().parent
TOOLS_JSON = SCRIPT_DIR.parent / "tools.json"
REQUIRED_TOP_LEVEL_KEYS = {
    "version",
    "updated_at",
    "description",
    "tools",
    "tool_categories",
    "justfile_targets",
    "justfile_aliases",
}
REQUIRED_TOOL_KEYS = {
    "id",
    "name",
    "type",
    "tool",
    "wrapper_command",
    "just_command",
    "execution_mode",
    "updated_at",
    "description",
}


def _reject_duplicate_object_keys(pairs: List[tuple[str, Any]]) -> Dict[str, Any]:
    """JSON hook that raises on duplicate object keys."""
    obj: Dict[str, Any] = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError(f"Duplicate key in tools.json: '{key}'")
        obj[key] = value
    return obj


def _load_json_dict(value: str) -> Dict[str, Any]:
    payload = json.loads(value, object_pairs_hook=_reject_duplicate_object_keys)
    if not isinstance(payload, dict):
        raise ValueError("Tools catalog must be a JSON object")
    return payload


def load_tools() -> Dict[str, Any]:
    """Load tools.json configuration."""
    if not TOOLS_JSON.exists():
        raise FileNotFoundError(f"Tools catalog not found: {TOOLS_JSON}")
    return _load_json_dict(TOOLS_JSON.read_text())


def format_type_badge(tool_type: str) -> str:
    """Format tool type with emoji badge."""
    key = tool_type.lower().strip()
    badges = {
        "validation": "✓",
        "creation": "➕",
        "documentation": "📄",
        "verification": "✓",
        "automation": "⚙",
        "synchronization": "🔄",
        "infrastructure": "🔧",
        "discovery": "🔍",
    }
    badge = badges.get(key, "•")
    return f"[{badge} {key}]"


def normalize_text(value: str) -> str:
    """Normalize text for accent/case-insensitive matching."""
    folded = unicodedata.normalize("NFKD", value)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    return ascii_only.lower()


SEARCH_ALIASES = {
    "automate": ["automat", "automation", "automatiza", "automatizar", "automacao"],
    "automation": ["automat", "automate", "automatiza", "automacao"],
    "validate": ["valid", "validation", "valida", "validar"],
    "verification": ["verify", "verif", "verifica"],
    "verify": ["verification", "verif", "verifica"],
    "create": ["cri", "creation", "cria", "criar"],
    "sync": ["synchronization", "sincroniza", "sincronizar"],
    "doc": ["documentation", "documentacao", "documentar"],
}


def expand_query_terms(query: str) -> Set[str]:
    """Expand query with normalized tokens and aliases."""
    qnorm = normalize_text(query)
    terms: Set[str] = {qnorm}
    tokens = [t for t in re.split(r"\W+", qnorm) if t]
    for token in tokens:
        terms.add(token)
        terms.update(SEARCH_ALIASES.get(token, []))
        if len(token) >= 5:
            terms.add(token[:5])
    return {t for t in terms if t}


def list_tools(tools_data: Dict[str, Any], filter_type: Optional[str] = None) -> bool:
    """List all available tools with descriptions."""
    tools = tools_data["tools"]
    available_types = {t["type"] for t in tools}

    if filter_type:
        if filter_type not in available_types:
            print(f"❌ Unknown type: {filter_type}")
            print(f"Available types: {', '.join(sorted(available_types))}")
            return False
        tools = [t for t in tools if t["type"] == filter_type]

    print("\n" + "=" * 70)
    print("  AGENTS TOOLS - Available Tools")
    print("=" * 70)
    print()

    if not tools:
        print(f"No tools found for type: {filter_type}")
        return True

    print(f"Total: {len(tools)} tool(s)")
    print()

    # Group by type
    by_type: Dict[str, List[Dict]] = {}
    for tool in tools:
        t = tool["type"]
        if t not in by_type:
            by_type[t] = []
        by_type[t].append(tool)

    for tool_type, type_tools in sorted(by_type.items()):
        print(f"\n{format_type_badge(tool_type)}")
        print("-" * 50)
        for tool in type_tools:
            desc = tool["description"]
            summary = f"{desc[:50]}..." if len(desc) > 50 else desc
            print(f"  {tool['id']:15} - {summary}")
        print()

    print("-" * 70)
    print("Usage: .agents/agents tools info <tool-id>  # Get detailed info")
    print("       .agents/agents tools search <query>  # Search tools")
    print("=" * 70 + "\n")
    return True


def show_tool_info(tools_data: Dict[str, Any], tool_id: str) -> bool:
    """Show detailed information about a specific tool."""
    tools = tools_data["tools"]
    tool = next((t for t in tools if t["id"] == tool_id), None)

    if not tool:
        print(f"❌ Tool not found: {tool_id}")
        print("\nAvailable tools:")
        for t in tools:
            print(f"  - {t['id']}")
        return False

    print("\n" + "=" * 70)
    print(f"  TOOL: {tool['name']}")
    print("=" * 70)
    print()
    print(f"ID:          {tool['id']}")
    print(f"Type:        {format_type_badge(tool['type'])}")
    print(f"Execution:   {tool['execution_mode']}")
    print(f"Updated:     {tool['updated_at']}")
    print()
    print("DESCRIPTION")
    print("-" * 70)
    print(f"  {tool['description']}")
    print()

    _print_when_to_use(tool)

    print("COMMANDS")
    print("-" * 70)
    print(f"  Wrapper:  {tool['wrapper_command']}")
    print(f"  Just:     {tool['just_command']}")
    print()

    _print_optional_tool_sections(tool)

    print("=" * 70 + "\n")
    return True


def _print_when_to_use(tool: Dict[str, Any]) -> None:
    print("WHEN TO USE")
    print("-" * 70)
    for use in tool.get("when_to_use", []):
        print(f"  • {use}")
    print()


def _print_optional_tool_sections(tool: Dict[str, Any]) -> None:
    """Print optional tool metadata sections."""
    _print_subcommands(tool)
    _print_options(tool)
    _print_checks(tool)
    _print_task_markers(tool)


def _print_subcommands(tool: Dict[str, Any]) -> None:
    if "commands" not in tool:
        return
    print("SUBCOMMANDS")
    print("-" * 70)
    for cmd in tool["commands"]:
        if isinstance(cmd, dict):
            print(f"  {cmd['name']:15} - {cmd['description']}")
            print(f"                  Usage: {cmd['usage']}")
            print()
        else:
            print(f"  {str(cmd):15}")
    print()


def _print_options(tool: Dict[str, Any]) -> None:
    if "options" not in tool:
        return
    print("OPTIONS")
    print("-" * 70)
    for opt in tool["options"]:
        print(f"  {opt}")
    print()


def _print_checks(tool: Dict[str, Any]) -> None:
    if "checks" not in tool:
        return
    print("CHECKS")
    print("-" * 70)
    for check in tool["checks"]:
        print(f"  ✓ {check}")
    print()


def _print_task_markers(tool: Dict[str, Any]) -> None:
    if "task_markers" not in tool:
        return
    print("TASK MARKERS")
    print("-" * 70)
    for marker, symbol in tool["task_markers"].items():
        print(f"  {marker:15} {symbol}")
    print()


def _matches_query(text: str, terms: Set[str]) -> bool:
    normalized = normalize_text(text)
    return any(term in normalized for term in terms)


def _command_text(cmd: Any) -> str:
    if isinstance(cmd, dict):
        return " ".join(
            [
                str(cmd.get("name", "")),
                str(cmd.get("usage", "")),
                str(cmd.get("description", "")),
            ]
        )
    return str(cmd)


def _score_tool_match(tool: Dict[str, Any], terms: Set[str]) -> Tuple[int, List[str]]:
    score = 0
    matched_fields: List[str] = []

    if _matches_query(tool.get("description", ""), terms):
        score += 3
        matched_fields.append("description")

    for use in tool.get("when_to_use", []):
        if _matches_query(use, terms):
            score += 2
            matched_fields.append("when_to_use")
            break

    if _matches_query(tool.get("id", ""), terms):
        score += 5
        matched_fields.append("id")
    if _matches_query(tool.get("name", ""), terms):
        score += 4
        matched_fields.append("name")
    if _matches_query(tool.get("type", ""), terms):
        score += 2
        matched_fields.append("type")

    for cmd in tool.get("commands", []):
        if _matches_query(_command_text(cmd), terms):
            score += 2
            matched_fields.append("commands")
            break

    return score, sorted(set(matched_fields))


def search_tools(tools_data: Dict[str, Any], query: str) -> None:
    """Search tools by query in multiple fields with normalized matching."""
    tools = tools_data["tools"]
    terms = expand_query_terms(query)

    matches = []
    for tool in tools:
        score, matched_fields = _score_tool_match(tool, terms)
        if score > 0:
            matches.append((score, tool, matched_fields))

    # Sort by score
    matches.sort(key=lambda x: x[0], reverse=True)

    print("\n" + "=" * 70)
    print(f"  SEARCH RESULTS: '{query}'")
    print("=" * 70)
    print()

    if not matches:
        print("No tools found matching your query.")
        print("\nTry different keywords like:")
        print("  validate, create, document, verify, automate, sync")
        print()
        return

    print(f"Found {len(matches)} tool(s):\n")

    for score, tool, fields in matches:
        print(f"{format_type_badge(tool['type'])} {tool['id']}")
        print(f"  Match: {', '.join(fields)} (score: {score})")
        print(f"  {tool['description'][:60]}...")
        print()

    print("-" * 70)
    print("Get detailed info: .agents/agents tools info <tool-id>")
    print("=" * 70 + "\n")


def show_help() -> None:
    """Show help message."""
    print("\n" + "=" * 70)
    print("  AGENTS TOOLS - Help")
    print("=" * 70)
    print()
    print("Discover and explore available .agents tools")
    print()
    print("USAGE:")
    print("  .agents/agents tools <command> [args]")
    print()
    print("COMMANDS:")
    print("  list [OPTIONS]       List all available tools")
    print("    --type <type>      Filter by type (validation, creation, etc.)")
    print()
    print("  info <tool-id>       Show detailed information about a tool")
    print("                       Includes subcommands, options, and usage")
    print()
    print("  search <query>       Search tools by keyword")
    print("                       Searches description and when_to_use fields")
    print()
    print("  validate             Validate tools catalog schema and consistency")
    print("                       Checks required keys, IDs, categories, and references")
    print()
    print("  smoke                Run tools CLI smoke tests")
    print("                       Verifies list/info/search/validate behavior end-to-end")
    print()
    print("  help                 Show this help message")
    print()
    print("EXAMPLES:")
    print("  .agents/agents tools list")
    print("  .agents/agents tools list --type validation")
    print("  .agents/agents tools info doctor")
    print("  .agents/agents tools search validate")
    print("  .agents/agents tools validate")
    print("  .agents/agents tools smoke")
    print("  .agents/agents tools info wb-update")
    print()
    print("TOOL TYPES:")
    print("  validation      - Validate structure, syntax, compliance")
    print("  creation        - Create new files and workstreams")
    print("  documentation   - Generate and update documentation")
    print("  verification    - Verify state and completion")
    print("  automation      - Automate repetitive low-value tasks")
    print("  synchronization - Maintain consistency between files")
    print("  infrastructure  - Support and execution wrappers")
    print("  discovery       - Discover available tools and how to use them")
    print()
    print("=" * 70 + "\n")


def _print_validate_errors(errors: List[str], warnings: List[str]) -> None:
    if errors:
        print(f"❌ Errors ({len(errors)}):")
        for err in errors:
            print(f"  - {err}")
    if warnings:
        print(f"⚠️  Warnings ({len(warnings)}):")
        for warn in warnings:
            print(f"  - {warn}")


def _validate_tool_entries(
    tools: List[Dict[str, Any]], ids: List[str], type_set: Set[str], errors: List[str]
) -> None:
    """Validate individual tool entries."""
    for idx, tool in enumerate(tools):
        if not isinstance(tool, dict):
            errors.append(f"tools[{idx}] must be an object")
            continue
        missing_tool_keys = sorted(REQUIRED_TOOL_KEYS - set(tool.keys()))
        if missing_tool_keys:
            errors.append(
                f"tools[{idx}] ({tool.get('id', '<missing-id>')}): missing keys: {', '.join(missing_tool_keys)}"
            )
        tid = tool.get("id")
        if isinstance(tid, str):
            ids.append(tid)
        else:
            errors.append(f"tools[{idx}] has non-string id")
        ttype = tool.get("type")
        if isinstance(ttype, str):
            type_set.add(ttype)
        else:
            errors.append(f"tools[{idx}] ({tid}) has non-string type")


def _validate_categories(
    categories: Any, type_set: Set[str], id_set: Set[str], errors: List[str]
) -> None:
    """Validate tool_categories structure and references."""
    if not isinstance(categories, dict):
        errors.append("`tool_categories` must be an object")
        return

    category_names = set(categories.keys())
    if not category_names:
        errors.append("`tool_categories` is empty")

    # Each tool type should have category
    missing_categories = sorted(type_set - category_names)
    if missing_categories:
        errors.append(f"Missing categories for tool types: {', '.join(missing_categories)}")

    # Category references should point to existing IDs
    for cname, cdata in categories.items():
        if not isinstance(cdata, dict):
            errors.append(f"Category `{cname}` must be an object")
            continue
        ctools = cdata.get("tools", [])
        if not isinstance(ctools, list):
            errors.append(f"Category `{cname}` field `tools` must be an array")
            continue
        unknown = sorted([x for x in ctools if x not in id_set])
        if unknown:
            errors.append(f"Category `{cname}` references unknown tool IDs: {', '.join(unknown)}")


def _validate_execution_modes(
    execution_modes: Any, ids: List[str], errors: List[str], warnings: List[str]
) -> None:
    """Validate execution_modes structure."""
    if execution_modes and not isinstance(execution_modes, dict):
        errors.append("`execution_modes` must be an object")
        return
    if isinstance(execution_modes, dict):
        on_demand = execution_modes.get("on-demand", {})
        if isinstance(on_demand, dict):
            declared = on_demand.get("tools", [])
            if isinstance(declared, list):
                undeclared = sorted([tid for tid in ids if tid not in declared])
                if undeclared:
                    warnings.append(
                        f"on-demand tools list does not include: {', '.join(undeclared)}"
                    )
            else:
                errors.append("`on-demand.tools` must be an array")


def validate_catalog(tools_data: Dict[str, Any]) -> int:
    """Validate tools catalog schema and cross-references."""
    errors: List[str] = []
    warnings: List[str] = []

    # Validate top-level keys
    missing_top = sorted(REQUIRED_TOP_LEVEL_KEYS - set(tools_data.keys()))
    if missing_top:
        errors.append(f"Missing top-level keys: {', '.join(missing_top)}")

    # Validate tools array
    tools = tools_data.get("tools")
    if not isinstance(tools, list) or not tools:
        errors.append("`tools` must be a non-empty array")
        tools = []

    # Collect IDs and types
    ids: List[str] = []
    type_set: Set[str] = set()

    # Validate tool entries
    _validate_tool_entries(tools, ids, type_set, errors)

    # Check for duplicate IDs
    duplicates = sorted({tid for tid in ids if ids.count(tid) > 1})
    if duplicates:
        errors.append(f"Duplicate tool IDs: {', '.join(duplicates)}")

    # Validate categories
    categories = tools_data.get("tool_categories", {})
    _validate_categories(categories, type_set, set(ids), errors)

    # Validate justfile_targets
    just_targets = tools_data.get("justfile_targets", {})
    if not isinstance(just_targets, dict):
        errors.append("`justfile_targets` must be an object")

    just_aliases = tools_data.get("justfile_aliases", {})
    if not isinstance(just_aliases, dict):
        errors.append("`justfile_aliases` must be an object")

    # Validate execution_modes
    execution_modes = tools_data.get("execution_modes", {})
    _validate_execution_modes(execution_modes, ids, errors, warnings)

    print("\n" + "=" * 70)
    print("  AGENTS TOOLS - Catalog Validation")
    print("=" * 70)
    print()
    print(f"Tools file: {TOOLS_JSON}")
    print(f"Tools found: {len(ids)}")
    categories = tools_data.get("tool_categories", {})
    print(f"Categories: {len(categories)}")
    print()

    _print_validate_errors(errors, warnings)

    if not errors and not warnings:
        print("✅ Catalog is valid")
    elif not errors:
        print("✅ Catalog valid with warnings")
    else:
        print("❌ Catalog validation failed")
    print("=" * 70 + "\n")
    return 1 if errors else 0


def main() -> None:
    """Main entry point."""
    args = sys.argv[1:]

    if not args:
        show_help()
        return

    command = args[0]

    try:
        tools_data = load_tools()
    except (FileNotFoundError, ValueError) as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

    if command in ["help", "-h", "--help"]:
        show_help()
        return

    command_handlers = {
        "list": lambda: _handle_list_command(args, tools_data),
        "info": lambda: _handle_info_command(args, tools_data),
        "search": lambda: _handle_search_command(args, tools_data),
        "validate": lambda: _handle_validate_command(tools_data),
        "smoke": _handle_smoke_command,
    }

    handler = command_handlers.get(command)
    if handler is None:
        print(f"❌ Unknown command: {command}")
        print("\nRun '.agents/agents tools help' for usage")
        sys.exit(1)
    handler()


def _handle_list_command(args: List[str], tools_data: Dict[str, Any]) -> None:
    filter_type = None
    if "--type" in args:
        type_idx = args.index("--type")
        if type_idx + 1 < len(args):
            filter_type = args[type_idx + 1]
    if not list_tools(tools_data, filter_type):
        sys.exit(1)


def _handle_info_command(args: List[str], tools_data: Dict[str, Any]) -> None:
    if len(args) < 2:
        print("❌ Error: tool-id required")
        print("Usage: .agents/agents tools info <tool-id>")
        print("\nExample: .agents/agents tools info doctor")
        sys.exit(1)
    if not show_tool_info(tools_data, args[1]):
        sys.exit(1)


def _handle_search_command(args: List[str], tools_data: Dict[str, Any]) -> None:
    if len(args) < 2:
        print("❌ Error: search query required")
        print("Usage: .agents/agents tools search <query>")
        print("\nExample: .agents/agents tools search validate")
        sys.exit(1)
    search_tools(tools_data, " ".join(args[1:]))


def _handle_validate_command(tools_data: Dict[str, Any]) -> None:
    sys.exit(validate_catalog(tools_data))


def _handle_smoke_command() -> None:
    smoke_script = SCRIPT_DIR / "agents-tools-smoke.py"
    if not smoke_script.exists():
        print(f"❌ Smoke script not found: {smoke_script}")
        sys.exit(1)
    result = subprocess.run([sys.executable, str(smoke_script)])
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
