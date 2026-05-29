from __future__ import annotations

import re
from dataclasses import dataclass
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


class KnowledgeSearchService:
    KNOWLEDGE_DOC_TYPES = {"research", "brainstorm", "explorer-check", "postmortem", "report"}

    def __init__(self, repo_root: Path, search_roots: tuple[Path, ...]) -> None:
        self.repo_root = repo_root
        self.search_roots = search_roots
        self.wb_dir = self.repo_root / ".agents" / "wb"

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
            searched_roots=[root.relative_to(self.repo_root).as_posix() for root in self.search_roots],
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
            parsed = self._split_frontmatter(path.read_text(encoding="utf-8", errors="ignore"))
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
        parsed = self._split_frontmatter(path.read_text(encoding="utf-8", errors="ignore"))
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
                    doc.path.relative_to(self.repo_root).as_posix(),
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
