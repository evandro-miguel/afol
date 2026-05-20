#!/usr/bin/env python3
"""Governed external-memory adapter for interactive agent runtimes.

This command family does not execute MCP tool calls directly from shell.
Instead, it resolves the configured provider and emits deterministic contracts
that tell interactive runtimes exactly how to use the memory provider.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict

from lib.agents_config import load_agents_config

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)

SUPPORTED_PROVIDERS = {
    "basic_memory": {
        "server": "basic_memory",
        "search_tool": "search_notes",
        "context_tool": "build_context",
        "recent_tool": "recent_activity",
        "show_tool": "read_note",
        "workspace_optional": True,
    }
}


def get_memory_config() -> Dict[str, Any]:
    raw = CONFIG.get("memory", {}) or {}
    provider = str(raw.get("provider", "basic_memory")).strip() or "basic_memory"
    defaults = SUPPORTED_PROVIDERS.get(provider, {})
    return {
        "enabled": bool(raw.get("enabled", False)),
        "required": bool(raw.get("required", False)),
        "provider": provider,
        "mode": str(raw.get("mode", "contract")).strip() or "contract",
        "authority": str(raw.get("authority", "auxiliary")).strip() or "auxiliary",
        "project": str(raw.get("project", "main")).strip() or "main",
        "workspace": str(raw.get("workspace", "")).strip(),
        "server": str(raw.get("runtime_server", defaults.get("server", provider))).strip()
        or provider,
        "search_tool": str(
            raw.get("search_tool", defaults.get("search_tool", "search_notes"))
        ).strip(),
        "context_tool": str(
            raw.get("context_tool", defaults.get("context_tool", "build_context"))
        ).strip(),
        "recent_tool": str(
            raw.get("recent_tool", defaults.get("recent_tool", "recent_activity"))
        ).strip(),
        "show_tool": str(raw.get("show_tool", defaults.get("show_tool", "read_note"))).strip(),
    }


def ensure_supported(cfg: Dict[str, Any]) -> None:
    if cfg["provider"] not in SUPPORTED_PROVIDERS:
        supported = ", ".join(sorted(SUPPORTED_PROVIDERS))
        raise ValueError(
            f"Unsupported memory provider '{cfg['provider']}'. Supported providers: {supported}"
        )


def json_arg_block(data: Dict[str, Any]) -> str:
    return json.dumps(data, indent=2, ensure_ascii=True)


def print_boundary_notes(cfg: Dict[str, Any]) -> None:
    print("Boundary")
    print("- `.agents/wb/` and repo-local `knowledge` remain canonical.")
    print(
        "- External memory is auxiliary retrieval and curated reuse, not live plan/task/report state."
    )
    if cfg["mode"] != "contract":
        print(
            f"- Runtime mode is configured as `{cfg['mode']}`, but this command family currently emits contracts only."
        )
    else:
        print(
            "- This command family emits MCP contracts only; it does not execute MCP tool calls from shell."
        )


def cmd_status(args: argparse.Namespace) -> int:
    cfg = get_memory_config()
    try:
        ensure_supported(cfg)
    except ValueError as exc:
        print(f"❌ {exc}")
        return 1

    print("# Memory Integration Status")
    print()
    print(f"- enabled: {str(cfg['enabled']).lower()}")
    print(f"- required: {str(cfg['required']).lower()}")
    print(f"- provider: {cfg['provider']}")
    print(f"- runtime server: {cfg['server']}")
    print(f"- project: {cfg['project']}")
    if cfg["workspace"]:
        print(f"- workspace: {cfg['workspace']}")
    print(f"- authority: {cfg['authority']}")
    print(f"- mode: {cfg['mode']}")
    print("- supported commands: status, search, context, recent, show")
    print(
        "- recommended order: `knowledge pull` -> `memory search/context` -> targeted repo reread"
    )
    print()
    print_boundary_notes(cfg)
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    cfg = get_memory_config()
    ensure_supported(cfg)
    project = args.project or cfg["project"]
    limit = args.limit
    payload: Dict[str, Any] = {
        "project": project,
        "query": args.query,
        "search_type": args.search_type,
        "page_size": limit,
        "output_format": "text",
    }
    if cfg["workspace"]:
        payload["workspace"] = cfg["workspace"]

    print("# Memory Search Contract")
    print()
    print(f"- runtime: {args.runtime}")
    print(f"- provider: {cfg['provider']}")
    print(f"- server: {cfg['server']}")
    print(f"- tool: {cfg['search_tool']}")
    print(f"- project: {project}")
    print(f"- query: {args.query}")
    print()
    print_boundary_notes(cfg)
    print()
    print("Use this MCP call:")
    print(f"- Server: `{cfg['server']}`")
    print(f"- Tool: `{cfg['search_tool']}`")
    print("- Arguments:")
    print("```json")
    print(json_arg_block(payload))
    print("```")
    print()
    print("Expected runtime behavior")
    print("- Return only the highest-signal notes first.")
    print("- Keep the response compact unless deeper context is requested.")
    print("- Do not treat returned notes as canonical project execution state.")
    return 0


def cmd_context(args: argparse.Namespace) -> int:
    cfg = get_memory_config()
    ensure_supported(cfg)
    project = args.project or cfg["project"]

    print("# Memory Context Contract")
    print()
    print(f"- runtime: {args.runtime}")
    print(f"- provider: {cfg['provider']}")
    print(f"- server: {cfg['server']}")
    print(f"- project: {project}")
    print(f"- topic: {args.topic}")
    print()
    print_boundary_notes(cfg)
    print()

    if args.url:
        payload: Dict[str, Any] = {
            "project": project,
            "url": args.url,
            "depth": args.depth,
            "max_related": args.max_related,
            "output_format": "text",
        }
        if cfg["workspace"]:
            payload["workspace"] = cfg["workspace"]
        print("Use this direct MCP call:")
        print(f"- Server: `{cfg['server']}`")
        print(f"- Tool: `{cfg['context_tool']}`")
        print("- Arguments:")
        print("```json")
        print(json_arg_block(payload))
        print("```")
    else:
        search_payload: Dict[str, Any] = {
            "project": project,
            "query": args.topic,
            "search_type": "hybrid",
            "page_size": args.limit,
            "output_format": "text",
        }
        if cfg["workspace"]:
            search_payload["workspace"] = cfg["workspace"]
        print("Two-step MCP flow:")
        print(f"1. Call `{cfg['search_tool']}` on server `{cfg['server']}` with:")
        print("```json")
        print(json_arg_block(search_payload))
        print("```")
        print("2. Choose the best permalink or memory:// URL from the search results.")
        print(f"3. Call `{cfg['context_tool']}` on server `{cfg['server']}` with:")
        print("```json")
        print(
            json_arg_block(
                {
                    "project": project,
                    "url": "memory://<selected-permalink>",
                    "depth": args.depth,
                    "max_related": args.max_related,
                    "output_format": "text",
                }
            )
        )
        print("```")
    print()
    print("Expected runtime behavior")
    print("- Prefer the strongest matching note or project node before expanding context.")
    print("- Keep the returned context auxiliary to repo-local workbench state.")
    return 0


def cmd_recent(args: argparse.Namespace) -> int:
    cfg = get_memory_config()
    ensure_supported(cfg)
    project = args.project or cfg["project"]
    payload: Dict[str, Any] = {
        "project": project,
        "timeframe": args.timeframe,
        "output_format": "text",
        "page_size": args.limit,
    }
    if cfg["workspace"]:
        payload["workspace"] = cfg["workspace"]

    print("# Memory Recent Activity Contract")
    print()
    print(f"- runtime: {args.runtime}")
    print(f"- provider: {cfg['provider']}")
    print(f"- server: {cfg['server']}")
    print(f"- tool: {cfg['recent_tool']}")
    print()
    print_boundary_notes(cfg)
    print()
    print("Use this MCP call:")
    print(f"- Server: `{cfg['server']}`")
    print(f"- Tool: `{cfg['recent_tool']}`")
    print("- Arguments:")
    print("```json")
    print(json_arg_block(payload))
    print("```")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    cfg = get_memory_config()
    ensure_supported(cfg)
    project = args.project or cfg["project"]
    payload: Dict[str, Any] = {
        "project": project,
        "identifier": args.identifier,
        "output_format": "text",
    }
    if cfg["workspace"]:
        payload["workspace"] = cfg["workspace"]

    print("# Memory Show Contract")
    print()
    print(f"- runtime: {args.runtime}")
    print(f"- provider: {cfg['provider']}")
    print(f"- server: {cfg['server']}")
    print(f"- tool: {cfg['show_tool']}")
    print(f"- identifier: {args.identifier}")
    print()
    print_boundary_notes(cfg)
    print()
    print("Use this MCP call:")
    print(f"- Server: `{cfg['server']}`")
    print(f"- Tool: `{cfg['show_tool']}`")
    print("- Arguments:")
    print("```json")
    print(json_arg_block(payload))
    print("```")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Governed external-memory adapter for interactive agent runtimes"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_status = sub.add_parser("status", help="show configured memory integration status")
    p_status.set_defaults(func=cmd_status)

    p_search = sub.add_parser("search", help="emit MCP contract for memory search")
    p_search.add_argument("query")
    p_search.add_argument("--project", help="override configured memory project")
    p_search.add_argument("--runtime", default="codex", help="interactive runtime label")
    p_search.add_argument("--search-type", default="hybrid", choices=["fts", "vector", "hybrid"])
    p_search.add_argument("--limit", type=int, default=5, help="page size / result limit hint")
    p_search.set_defaults(func=cmd_search)

    p_context = sub.add_parser("context", help="emit MCP contract for context expansion")
    p_context.add_argument("topic")
    p_context.add_argument("--project", help="override configured memory project")
    p_context.add_argument("--runtime", default="codex", help="interactive runtime label")
    p_context.add_argument("--url", help="explicit memory:// URL or permalink to expand directly")
    p_context.add_argument("--depth", type=int, default=1)
    p_context.add_argument("--max-related", type=int, default=3)
    p_context.add_argument(
        "--limit", type=int, default=5, help="search page size when URL is not provided"
    )
    p_context.set_defaults(func=cmd_context)

    p_recent = sub.add_parser("recent", help="emit MCP contract for recent memory activity")
    p_recent.add_argument("--project", help="override configured memory project")
    p_recent.add_argument("--runtime", default="codex", help="interactive runtime label")
    p_recent.add_argument("--timeframe", default="7d")
    p_recent.add_argument("--limit", type=int, default=10)
    p_recent.set_defaults(func=cmd_recent)

    p_show = sub.add_parser("show", help="emit MCP contract for one memory note")
    p_show.add_argument("identifier")
    p_show.add_argument("--project", help="override configured memory project")
    p_show.add_argument("--runtime", default="codex", help="interactive runtime label")
    p_show.set_defaults(func=cmd_show)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except ValueError as exc:
        print(f"❌ {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
