from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class TreeNode(BaseModel):
    path: str
    name: str
    kind: Literal["file", "dir"]
    size_bytes: int = 0
    modified_at: Optional[datetime] = None
    children: list["TreeNode"] = Field(default_factory=list)


class WorkspaceSummary(BaseModel):
    root: str
    max_depth: int
    file_count: int
    dir_count: int
    truncated: bool = False
    tree: list[TreeNode]


class SearchHit(BaseModel):
    path: str
    title: str
    doc_type: Optional[str] = None
    score: float
    snippet: str


class SearchResponse(BaseModel):
    query: str
    searched_roots: list[str]
    total_candidates: int
    hits: list[SearchHit]


class ValidationIssue(BaseModel):
    severity: Literal["error", "warning", "info"]
    code: str
    path: str
    message: str


class ValidationReport(BaseModel):
    ok: bool
    created_dirs: list[str] = Field(default_factory=list)
    issues: list[ValidationIssue] = Field(default_factory=list)

    @property
    def error_count(self) -> int:
        return sum(1 for issue in self.issues if issue.severity == "error")

    @property
    def warning_count(self) -> int:
        return sum(1 for issue in self.issues if issue.severity == "warning")


class SkillSummary(BaseModel):
    name: str
    path: str


class RepoManifest(BaseModel):
    repo_root: str
    docs_markdown_files: int
    script_files: int
    test_files: int
    skill_count: int
    skills: list[SkillSummary]
    runtime_docs: dict[str, bool]
    tool_catalog_count: int
    major_surfaces: list[str]
    search_roots: list[str]
    write_blocklist: list[str]


class ChangeRecord(BaseModel):
    change_id: str
    action: Literal["write_text", "patch", "archive"]
    target_paths: list[str]
    reason: str
    created_at: datetime


class FileWriteResult(BaseModel):
    change_id: str
    path: str
    bytes_written: int
    reason: str


class ArchiveResult(BaseModel):
    change_id: str
    archived_to: str
    moved: list[str]
    reason: str


class UndoResult(BaseModel):
    ok: bool
    message: str
    restored_paths: list[str] = Field(default_factory=list)


AdoptionActionKind = Literal[
    "create",
    "skip",
    "patch-managed",
    "adapt-config",
    "add-wrapper",
    "reconcile-skills",
    "conflict",
    "benchmark",
    "rollback-record",
]


class AdoptionAction(BaseModel):
    kind: AdoptionActionKind
    path: Optional[str] = None
    status: Literal["ready", "blocked", "observed"] = "ready"
    reason: str
    managed: bool = False
    notes: list[str] = Field(default_factory=list)


class AdoptionInspection(BaseModel):
    repo_root: str
    has_justfile: bool
    justfile_uses_direct_import: bool
    has_runtime_wrapper: bool
    runtime_wrapper_exposes_runtime: bool
    has_mcp_wrapper: bool
    has_legacy_agents_config: bool
    legacy_agents_layout_detected: bool
    has_skills_manifest: bool
    has_repo_local_skills_seed: bool
    has_docs_map: bool
    has_docs_arc: bool
    has_bootstrap_adaptation_doc: bool


class AdoptionPlan(BaseModel):
    repo_root: str
    inspection: AdoptionInspection
    actions: list[AdoptionAction]
    counts: dict[str, int]
    summary: str


TreeNode.model_rebuild()
