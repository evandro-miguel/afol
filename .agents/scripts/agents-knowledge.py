#!/usr/bin/env python3
"""Index and search reusable workbench knowledge artifacts."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable, List

try:
    import yaml
except ImportError as exc:
    print(f"❌ Missing dependency: {exc}")
    sys.exit(1)

from lib.agents_config import get_cfg_path, load_agents_config, parse_offset

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
DEFAULT_OFFSET = CONFIG.get("time", {}).get("default_offset", "+00:00")
DEFAULT_TZ = parse_offset(DEFAULT_OFFSET)
KNOWLEDGE_DIR = get_cfg_path(ROOT_DIR, CONFIG, "knowledge_dir")
INDEX_FILE = KNOWLEDGE_DIR / "INDEX.md"
DOC_TYPES = {"research", "brainstorm", "explorer-check", "postmortem", "report"}


class KnowledgeDoc:
    def __init__(self, path: Path, doc_type: str, doc_id: str, theme: str, status: str, title: str, summary: str):
        self.path = path
        self.doc_type = doc_type
        self.doc_id = doc_id
        self.theme = theme
        self.status = status
        self.title = title
        self.summary = summary


class MatchSnippet:
    def __init__(self, line_no: int, text: str):
        self.line_no = line_no
        self.text = text


def split_frontmatter(content: str) -> tuple[dict, str] | None:
    if not content.startswith("---\n"):
        return None
    parts = content.split("---", 2)
    if len(parts) < 3:
        return None
    loaded = yaml.safe_load(parts[1].strip()) or {}
    if not isinstance(loaded, dict):
        return None
    return loaded, parts[2].lstrip("\n")


def iter_knowledge_docs() -> Iterable[KnowledgeDoc]:
    for path in sorted(WB_DIR.rglob("*.md")):
        parsed = split_frontmatter(path.read_text())
        if not parsed:
            continue
        fm, body = parsed
        doc_type = str(fm.get("doc_type", "")).strip()
        if doc_type not in DOC_TYPES:
            continue
        title = ""
        for line in body.splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
                break
        summary = summarize_body(body)
        yield KnowledgeDoc(
            path=path,
            doc_type=doc_type,
            doc_id=str(fm.get("id", path.stem)).strip(),
            theme=str(fm.get("theme", "")).strip(),
            status=str(fm.get("status", "")).strip(),
            title=title or path.stem,
            summary=summary,
        )


def summarize_body(body: str) -> str:
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("---"):
            continue
        stripped = re.sub(r"`([^`]+)`", r"\1", stripped)
        return stripped[:180]
    return ""


def compact_line(text: str) -> str:
    text = re.sub(r"\s+", " ", text.strip())
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text[:180]


def extract_matching_snippets(path: Path, query: str, limit: int = 2) -> List[MatchSnippet]:
    parsed = split_frontmatter(path.read_text())
    if not parsed:
        return []

    _, body = parsed
    query_lower = query.lower()
    snippets: List[MatchSnippet] = []
    for line_no, raw_line in enumerate(body.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if query_lower in stripped.lower():
            compact = compact_line(stripped)
            if compact:
                snippets.append(MatchSnippet(line_no=line_no, text=compact))
            if len(snippets) >= limit:
                break
    return snippets


def relative(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT_DIR))
    except ValueError:
        return str(path)


def cmd_list(args: argparse.Namespace) -> int:
    docs = [doc for doc in iter_knowledge_docs() if not args.type or doc.doc_type == args.type]
    if not docs:
        print("No knowledge documents found.")
        return 0
    for doc in docs[: args.limit]:
        print(f"{doc.doc_type:14} {doc.doc_id:55} {relative(doc.path)}")
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    query = args.query.lower()
    docs: List[tuple[int, KnowledgeDoc]] = []
    for doc in iter_knowledge_docs():
        haystack = " ".join([doc.doc_id, doc.doc_type, doc.theme, doc.title, doc.summary, relative(doc.path)]).lower()
        score = haystack.count(query)
        if score > 0:
            docs.append((score, doc))

    docs.sort(key=lambda item: (-item[0], item[1].doc_id))
    if not docs:
        print(f"No knowledge matches for '{args.query}'.")
        return 0

    for score, doc in docs[: args.limit]:
        print(f"[{score}] {doc.doc_type} | {doc.doc_id}")
        print(f"  path: {relative(doc.path)}")
        if doc.summary:
            print(f"  summary: {doc.summary}")
    return 0


def cmd_pull(args: argparse.Namespace) -> int:
    query = args.query.lower()
    docs: List[tuple[int, KnowledgeDoc, List[MatchSnippet]]] = []
    for doc in iter_knowledge_docs():
        haystack = " ".join([doc.doc_id, doc.doc_type, doc.theme, doc.title, doc.summary, relative(doc.path)]).lower()
        score = haystack.count(query)
        snippets = extract_matching_snippets(doc.path, args.query, limit=args.snippets)
        score += len(snippets) * 2
        if score > 0:
            docs.append((score, doc, snippets))

    docs.sort(key=lambda item: (-item[0], item[1].doc_id))
    if not docs:
        print(f"No reusable knowledge found for '{args.query}'.")
        return 0

    print(f"# Knowledge Pull: {args.query}")
    print()
    for score, doc, snippets in docs[: args.limit]:
        print(f"- {doc.doc_id} ({doc.doc_type}, score={score})")
        print(f"  path: {relative(doc.path)}")
        if doc.summary:
            print(f"  summary: {doc.summary}")
        if snippets:
            for snippet in snippets:
                print(f"  snippet L{snippet.line_no}: {snippet.text}")
        print(f"  reuse: open with '.agents/agents knowledge show {doc.doc_id}' if deeper context is needed")
    return 0


def resolve_doc(reference: str) -> KnowledgeDoc | None:
    candidate = Path(reference)
    if candidate.exists():
        resolved = candidate.resolve()
        for doc in iter_knowledge_docs():
            if doc.path.resolve() == resolved:
                return doc
    for doc in iter_knowledge_docs():
        if doc.doc_id == reference or relative(doc.path) == reference:
            return doc
    return None


def cmd_show(args: argparse.Namespace) -> int:
    doc = resolve_doc(args.reference)
    if doc is None:
        print(f"Knowledge document not found: {args.reference}")
        return 1
    print(f"id: {doc.doc_id}")
    print(f"type: {doc.doc_type}")
    print(f"path: {relative(doc.path)}")
    print(f"title: {doc.title}")
    print()
    print(doc.path.read_text())
    return 0


def cmd_index(args: argparse.Namespace) -> int:
    docs = list(iter_knowledge_docs())
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(DEFAULT_TZ).strftime(f"%Y-%m-%dT%H:%M:%S{DEFAULT_OFFSET}")
    grouped = {}
    for doc in docs:
        grouped.setdefault(doc.doc_type, []).append(doc)

    lines = [
        "---",
        'doc_type: index',
        'id: "knowledge_index"',
        "status: active",
        f'created_at: "{timestamp}"',
        f'updated_at: "{timestamp}"',
        "---",
        "",
        "# Knowledge Index",
        "",
        "Low-token discovery index for reusable workbench knowledge artifacts.",
        "",
        f"- Total indexed docs: {len(docs)}",
        "",
    ]
    for doc_type in sorted(grouped):
        lines.extend([f"## {doc_type.title()}", ""])
        for doc in grouped[doc_type]:
            lines.append(f"- `{doc.doc_id}` | `{relative(doc.path)}` | {doc.summary or doc.title}")
        lines.append("")

    INDEX_FILE.write_text("\n".join(lines).rstrip() + "\n")
    print(f"✓ knowledge index updated: {relative(INDEX_FILE)} ({len(docs)} docs)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Search reusable workbench knowledge")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="list knowledge docs")
    p_list.add_argument("--type", choices=sorted(DOC_TYPES), help="filter by doc type")
    p_list.add_argument("--limit", type=int, default=30)
    p_list.set_defaults(func=cmd_list)

    p_search = sub.add_parser("search", help="search knowledge docs")
    p_search.add_argument("query")
    p_search.add_argument("--limit", type=int, default=10)
    p_search.set_defaults(func=cmd_search)

    p_pull = sub.add_parser("pull", help="pull a compact digest for a topic")
    p_pull.add_argument("query")
    p_pull.add_argument("--limit", type=int, default=5)
    p_pull.add_argument("--snippets", type=int, default=2)
    p_pull.set_defaults(func=cmd_pull)

    p_show = sub.add_parser("show", help="show one knowledge doc")
    p_show.add_argument("reference", help="doc id or path")
    p_show.set_defaults(func=cmd_show)

    p_index = sub.add_parser("index", help="generate knowledge index")
    p_index.set_defaults(func=cmd_index)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    raise SystemExit(args.func(args))


if __name__ == "__main__":
    main()
