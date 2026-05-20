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


class KnowledgeSearchService:
    def __init__(self, repo_root: Path, search_roots: tuple[Path, ...]) -> None:
        self.repo_root = repo_root
        self.search_roots = search_roots

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
        candidates = [self._extract(path) for path in self._iter_markdown_files()]
        hits: list[SearchHit] = []
        for candidate in candidates:
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
            total_candidates=len(candidates),
            hits=hits[:limit],
        )
