from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml
from rapidfuzz import fuzz

from agentic_scaffold.models import SearchHit, SearchResponse


@dataclass(frozen=True)
class Candidate:
    path: Path
    title: str
    doc_type: str | None
    snippet: str
    searchable_text: str


@dataclass(frozen=True)
class KnowledgeSnippet:
    line_no: int
    text: str


@dataclass(frozen=True)
class KnowledgeDoc:
    path: Path
    doc_type: str
    doc_id: str
    theme: str
    title: str
    summary: str


@dataclass(frozen=True)
class KnowledgePullHit:
    score: int
    doc: KnowledgeDoc
    snippets: tuple[KnowledgeSnippet, ...]


@dataclass(frozen=True)
class KnowledgeIndexResult:
    changed: bool
    doc_count: int
    path_label: str


class KnowledgeSearchService:
    KNOWLEDGE_DOC_TYPES = {"research", "brainstorm", "explorer-check", "postmortem", "report"}

    def __init__(self, repo_root: Path, search_roots: tuple[Path, ...]) -> None:
        self.repo_root = repo_root
        self.search_roots = search_roots
        self.wb_dir = self.repo_root / ".agents" / "wb"
        self.knowledge_index_file = self.repo_root / "docs" / "knowledge" / "INDEX.md"

    def _iter_markdown_files(self):
        for root in self.search_roots:
            if not root.exists():
                continue
            yield from root.rglob("*.md")

    def _extract(self, path: Path) -> Candidate:
        text = path.read_text(encoding="utf-8", errors="ignore")
        frontmatter: dict[str, str] = {}
        body = text
        if text.startswith("---\n"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                try:
                    loaded = yaml.safe_load(parts[1].strip()) or {}
                except yaml.YAMLError:
                    loaded = {}
                if isinstance(loaded, dict):
                    frontmatter = {str(k): str(v) for k, v in loaded.items()}
                    body = parts[2]
        title = frontmatter.get("title", "").strip()
        if not title:
            for line in body.splitlines():
                if line.startswith("# "):
                    title = line[2:].strip()
                    break
        if not title:
            title = path.stem
        snippet = self._first_meaningful_line(body)
        searchable = " ".join(
            part
            for part in [
                path.relative_to(self.repo_root).as_posix(),
                title,
                frontmatter.get("doc_type", ""),
                frontmatter.get("theme", ""),
                snippet,
                body[:4000],
            ]
            if part
        )
        return Candidate(
            path=path,
            title=title,
            doc_type=frontmatter.get("doc_type"),
            snippet=snippet,
            searchable_text=searchable,
        )

    @staticmethod
    def _first_meaningful_line(body: str) -> str:
        for raw in body.splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or line.startswith("---"):
                continue
            line = re.sub(r"\s+", " ", line)
            return line[:220]
        return ""

    def search(self, query: str, limit: int = 8) -> SearchResponse:
        normalized = query.strip()
        total_candidates = 0
        hits: list[SearchHit] = []
        for path in self._iter_markdown_files():
            total_candidates += 1
            candidate = self._extract(path)
            score = max(
                fuzz.token_set_ratio(normalized, candidate.searchable_text),
                fuzz.partial_ratio(normalized, candidate.searchable_text),
            )
            if score < 45:
                continue
            hits.append(
                SearchHit(
                    path=candidate.path.relative_to(self.repo_root).as_posix(),
                    title=candidate.title,
                    doc_type=candidate.doc_type,
                    score=float(score),
                    snippet=candidate.snippet,
                )
            )
        hits.sort(key=lambda item: (-item.score, item.path))
        return SearchResponse(
            query=normalized,
            searched_roots=[
                root.relative_to(self.repo_root).as_posix() for root in self.search_roots
            ],
            total_candidates=total_candidates,
            hits=hits[:limit],
        )

    @staticmethod
    def _split_frontmatter(content: str) -> tuple[dict[str, str], str] | None:
        if not content.startswith("---\n"):
            return None
        parts = content.split("---", 2)
        if len(parts) < 3:
            return None
        try:
            loaded = yaml.safe_load(parts[1].strip())
        except yaml.YAMLError:
            return None
        if not isinstance(loaded, dict):
            return None
        frontmatter = {str(key): str(value) for key, value in loaded.items()}
        return frontmatter, parts[2].lstrip("\n")

    @staticmethod
    def _compact_line(text: str) -> str:
        compact = re.sub(r"\s+", " ", text.strip())
        compact = re.sub(r"`([^`]+)`", r"\1", compact)
        return compact[:180]

    def _repo_relative_path(self, path: Path) -> str:
        try:
            return path.relative_to(self.repo_root).as_posix()
        except ValueError:
            return str(path)

    @staticmethod
    def _parse_offset(offset: str) -> timezone:
        value = offset.strip()
        if value == "Z":
            return timezone.utc
        if len(value) != 6 or value[0] not in {"+", "-"} or value[3] != ":":
            raise ValueError(f"Invalid timezone offset format: {offset}")
        sign = value[0]
        try:
            hours = int(value[1:3])
            minutes = int(value[4:6])
        except ValueError as exc:
            raise ValueError(f"Invalid timezone offset format: {offset}") from exc
        if not (0 <= hours <= 23):
            raise ValueError(f"Invalid timezone offset format: {offset}")
        if not (0 <= minutes <= 59):
            raise ValueError(f"Invalid timezone offset format: {offset}")
        delta = timedelta(hours=hours, minutes=minutes)
        if sign == "-":
            delta = -delta
        return timezone(delta)

    def _load_default_offset(self) -> str:
        config_path = self.repo_root / ".agents" / "agents.config"
        if not config_path.exists():
            return "+00:00"
        try:
            loaded = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        except (OSError, yaml.YAMLError):
            return "+00:00"
        if not isinstance(loaded, dict):
            return "+00:00"
        time_cfg = loaded.get("time")
        if not isinstance(time_cfg, dict):
            return "+00:00"
        raw_offset = str(time_cfg.get("default_offset", "+00:00")).strip()
        if not raw_offset:
            return "+00:00"
        try:
            self._parse_offset(raw_offset)
        except ValueError:
            return "+00:00"
        return raw_offset

    @classmethod
    def _summarize_body(cls, body: str) -> str:
        for line in body.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or stripped.startswith("---"):
                continue
            return cls._compact_line(stripped)
        return ""

    def _iter_knowledge_docs(self):
        if not self.wb_dir.exists():
            return
        for path in sorted(self.wb_dir.rglob("*.md")):
            parsed = self._split_frontmatter(path.read_text(encoding="utf-8"))
            if parsed is None:
                continue
            frontmatter, body = parsed
            doc_type = frontmatter.get("doc_type", "").strip()
            if doc_type not in self.KNOWLEDGE_DOC_TYPES:
                continue
            title = ""
            for line in body.splitlines():
                if line.startswith("# "):
                    title = line[2:].strip()
                    break
            yield KnowledgeDoc(
                path=path,
                doc_type=doc_type,
                doc_id=frontmatter.get("id", path.stem).strip() or path.stem,
                theme=frontmatter.get("theme", "").strip(),
                title=title or path.stem,
                summary=self._summarize_body(body),
            )

    def _extract_matching_snippets(self, path: Path, query: str, limit: int) -> list[KnowledgeSnippet]:
        parsed = self._split_frontmatter(path.read_text(encoding="utf-8"))
        if parsed is None:
            return []
        _, body = parsed
        normalized_query = query.lower()
        snippets: list[KnowledgeSnippet] = []
        for line_no, raw_line in enumerate(body.splitlines(), start=1):
            stripped = raw_line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if normalized_query not in stripped.lower():
                continue
            compact = self._compact_line(stripped)
            if compact:
                snippets.append(KnowledgeSnippet(line_no=line_no, text=compact))
            if len(snippets) >= limit:
                break
        return snippets

    def list_knowledge_docs(self, doc_type: str | None = None, limit: int = 30) -> list[KnowledgeDoc]:
        docs = [doc for doc in self._iter_knowledge_docs() or () if not doc_type or doc.doc_type == doc_type]
        return docs[:limit]

    def search_knowledge_docs(self, query: str, limit: int = 10) -> list[tuple[int, KnowledgeDoc]]:
        normalized_query = query.lower()
        hits: list[tuple[int, KnowledgeDoc]] = []
        for doc in self._iter_knowledge_docs() or ():
            haystack = " ".join(
                [
                    doc.doc_id,
                    doc.doc_type,
                    doc.theme,
                    doc.title,
                    doc.summary,
                    self._repo_relative_path(doc.path),
                ]
            ).lower()
            score = haystack.count(normalized_query)
            if score > 0:
                hits.append((score, doc))
        hits.sort(key=lambda item: (-item[0], item[1].doc_id))
        return hits[:limit]

    def resolve_knowledge_doc(self, reference: str) -> KnowledgeDoc | None:
        candidate = Path(reference)
        if candidate.exists():
            resolved = candidate.resolve()
            for doc in self._iter_knowledge_docs() or ():
                if doc.path.resolve() == resolved:
                    return doc
        for doc in self._iter_knowledge_docs() or ():
            relative_path = doc.path.relative_to(self.repo_root).as_posix()
            if doc.doc_id == reference or relative_path == reference:
                return doc
        return None

    def pull(self, query: str, limit: int = 5, snippets: int = 2) -> list[KnowledgePullHit]:
        normalized_query = query.lower()
        hits: list[KnowledgePullHit] = []
        for doc in self._iter_knowledge_docs() or ():
            haystack = " ".join(
                [
                    doc.doc_id,
                    doc.doc_type,
                    doc.theme,
                    doc.title,
                    doc.summary,
                    self._repo_relative_path(doc.path),
                ]
            ).lower()
            score = haystack.count(normalized_query)
            matched_snippets = self._extract_matching_snippets(doc.path, query=query, limit=snippets)
            score += len(matched_snippets) * 2
            if score == 0:
                continue
            hits.append(KnowledgePullHit(score=score, doc=doc, snippets=tuple(matched_snippets)))
        hits.sort(key=lambda item: (-item.score, item.doc.doc_id))
        return hits[:limit]

    def index_knowledge_docs(self) -> KnowledgeIndexResult:
        docs = list(self._iter_knowledge_docs() or ())
        self.knowledge_index_file.parent.mkdir(parents=True, exist_ok=True)

        default_offset = self._load_default_offset()
        now_ts = datetime.now(self._parse_offset(default_offset)).strftime(f"%Y-%m-%dT%H:%M:%S{default_offset}")
        previous = self.knowledge_index_file.read_text(encoding="utf-8") if self.knowledge_index_file.exists() else ""

        created_at = now_ts
        updated_at = now_ts
        parsed_previous = self._split_frontmatter(previous) if previous else None
        if parsed_previous is not None:
            frontmatter, _ = parsed_previous
            existing_created = frontmatter.get("created_at")
            existing_updated = frontmatter.get("updated_at")
            if existing_created:
                created_at = existing_created.strip()
            if existing_updated:
                updated_at = existing_updated.strip()

        grouped: dict[str, list[KnowledgeDoc]] = {}
        for doc in docs:
            grouped.setdefault(doc.doc_type, []).append(doc)

        lines = [
            "---",
            "doc_type: index",
            'id: "knowledge_index"',
            "status: active",
            f'created_at: "{created_at}"',
            f'updated_at: "{updated_at}"',
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
                lines.append(
                    f"- `{doc.doc_id}` | `{self._repo_relative_path(doc.path)}` | {doc.summary or doc.title}"
                )
            lines.append("")

        stable_content = "\n".join(lines).rstrip() + "\n"
        if stable_content == previous:
            return KnowledgeIndexResult(changed=False, doc_count=len(docs), path_label=self._repo_relative_path(self.knowledge_index_file))

        lines[5] = f'updated_at: "{now_ts}"'
        next_content = "\n".join(lines).rstrip() + "\n"
        if next_content == previous:
            return KnowledgeIndexResult(changed=False, doc_count=len(docs), path_label=self._repo_relative_path(self.knowledge_index_file))

        self.knowledge_index_file.write_text(next_content, encoding="utf-8")
        return KnowledgeIndexResult(changed=True, doc_count=len(docs), path_label=self._repo_relative_path(self.knowledge_index_file))
