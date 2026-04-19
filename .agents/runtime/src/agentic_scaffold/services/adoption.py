from __future__ import annotations

from collections import Counter
from pathlib import Path

from agentic_scaffold.config import RuntimeConfig
from agentic_scaffold.models import AdoptionAction, AdoptionInspection, AdoptionPlan

_WRAPPER_ROUTE_MARKERS = ("runtime", "mcp")


class AdoptionPlanner:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config

    def inspect(self) -> AdoptionInspection:
        root = self.config.repo_root
        justfile = root / "Justfile"
        runtime_wrapper = root / ".agents" / "agents"
        mcp_wrapper = root / ".agents" / "agents-mcp"
        agents_config = root / ".agents" / "agents.config"
        skills_manifest = root / ".agents" / "skills-sync.manifest.json"
        skills_seed = root / ".agents" / "source" / "universal-skills"
        docs_map = root / "docs" / "map"
        docs_arc = root / "docs" / "arc"
        adaptation_doc = root / "docs" / "standards" / "bootstrap-adaptation.md"

        justfile_text = justfile.read_text(encoding="utf-8") if justfile.exists() else ""
        wrapper_text = runtime_wrapper.read_text(encoding="utf-8") if runtime_wrapper.exists() else ""

        return AdoptionInspection(
            repo_root=str(root),
            has_justfile=justfile.exists(),
            justfile_uses_direct_import="import 'docs/standards/Justfile'" in justfile_text,
            has_runtime_wrapper=runtime_wrapper.exists(),
            runtime_wrapper_exposes_runtime=all(marker in wrapper_text for marker in _WRAPPER_ROUTE_MARKERS)
            if runtime_wrapper.exists()
            else False,
            has_mcp_wrapper=mcp_wrapper.exists(),
            has_legacy_agents_config=agents_config.exists(),
            legacy_agents_layout_detected=self._legacy_agents_layout_detected(agents_config),
            has_skills_manifest=skills_manifest.exists(),
            has_repo_local_skills_seed=skills_seed.exists(),
            has_docs_map=docs_map.exists(),
            has_docs_arc=docs_arc.exists(),
            has_bootstrap_adaptation_doc=adaptation_doc.exists(),
        )

    def plan(self) -> AdoptionPlan:
        inspection = self.inspect()
        root = self.config.repo_root
        actions: list[AdoptionAction] = []

        actions.extend(self._plan_justfile(root, inspection))
        actions.extend(self._plan_wrappers(root, inspection))
        actions.extend(self._plan_config(root, inspection))
        actions.extend(self._plan_docs(root, inspection))
        actions.extend(self._plan_skills(root, inspection))
        actions.append(
            AdoptionAction(
                kind="benchmark",
                path=None,
                reason="record dry-run/apply/idempotence timings and validation evidence",
                managed=False,
                notes=["include p50/p95 over repeated runs"],
            )
        )
        actions.append(
            AdoptionAction(
                kind="rollback-record",
                path=".agents/journal/agentic-runtime",
                reason="capture undo metadata for every mutating batch",
                managed=True,
                notes=["journal latest applied changes so undo remains available"],
            )
        )

        counts = Counter(action.kind for action in actions)
        summary = self._summarize_plan(actions, inspection)
        return AdoptionPlan(
            repo_root=str(root),
            inspection=inspection,
            actions=actions,
            counts=dict(counts),
            summary=summary,
        )

    def _plan_justfile(self, root: Path, inspection: AdoptionInspection) -> list[AdoptionAction]:
        justfile = root / "Justfile"
        if not justfile.exists():
            return [
                AdoptionAction(
                    kind="create",
                    path="Justfile",
                    reason="target repo is missing the root Justfile overlay entrypoint",
                    managed=True,
                    notes=["create direct import surface for scaffold recipes"],
                )
            ]

        text = justfile.read_text(encoding="utf-8")
        if "import 'docs/standards/Justfile'" in text:
            return [
                AdoptionAction(
                    kind="skip",
                    path="Justfile",
                    reason="root Justfile already uses the direct scaffold import",
                    managed=True,
                )
            ]
        if "mod agents_scaffold 'docs/standards/Justfile'" in text:
            return [
                AdoptionAction(
                    kind="patch-managed",
                    path="Justfile",
                    reason="root Justfile still uses the old namespaced module import",
                    managed=True,
                    notes=["patch to direct import so root recipes stay visible"],
                )
            ]
        return [
            AdoptionAction(
                kind="conflict",
                path="Justfile",
                reason="root Justfile is project-owned and does not match the scaffold import contract",
                managed=False,
                notes=["review before replacement"],
            )
        ]

    def _plan_wrappers(self, root: Path, inspection: AdoptionInspection) -> list[AdoptionAction]:
        actions: list[AdoptionAction] = []
        runtime_wrapper = root / ".agents" / "agents"
        mcp_wrapper = root / ".agents" / "agents-mcp"

        if not runtime_wrapper.exists():
            actions.append(
                AdoptionAction(
                    kind="add-wrapper",
                    path=".agents/agents",
                    reason="runtime wrapper is missing and should expose runtime/mcp routes",
                    managed=True,
                )
            )
        elif not inspection.runtime_wrapper_exposes_runtime:
            actions.append(
                AdoptionAction(
                    kind="patch-managed",
                    path=".agents/agents",
                    reason="runtime wrapper exists but does not expose runtime and mcp routes",
                    managed=True,
                    notes=["update wrapper dispatch to the shared runtime command registry"],
                )
            )
        else:
            actions.append(
                AdoptionAction(
                    kind="skip",
                    path=".agents/agents",
                    reason="runtime wrapper already exposes runtime and mcp routes",
                    managed=True,
                )
            )

        if not mcp_wrapper.exists():
            actions.append(
                AdoptionAction(
                    kind="add-wrapper",
                    path=".agents/agents-mcp",
                    reason="thin MCP wrapper is missing from the target repo",
                    managed=True,
                )
            )
        else:
            actions.append(
                AdoptionAction(
                    kind="skip",
                    path=".agents/agents-mcp",
                    reason="MCP wrapper already exists",
                    managed=True,
                )
            )

        return actions

    def _plan_config(self, root: Path, inspection: AdoptionInspection) -> list[AdoptionAction]:
        actions: list[AdoptionAction] = []
        agents_config = root / ".agents" / "agents.config"
        if not agents_config.exists():
            actions.append(
                AdoptionAction(
                    kind="create",
                    path=".agents/agents.config",
                    reason="target repo is missing the scaffold config baseline",
                    managed=True,
                )
            )
        elif inspection.legacy_agents_layout_detected:
            actions.append(
                AdoptionAction(
                    kind="adapt-config",
                    path=".agents/agents.config",
                    reason="target repo still uses a legacy .agents-relative layout",
                    managed=True,
                    notes=["translate legacy layout entries without clobbering target-owned config"],
                )
            )
        else:
            actions.append(
                AdoptionAction(
                    kind="skip",
                    path=".agents/agents.config",
                    reason="target config already matches the current scaffold contract",
                    managed=True,
                )
            )

        adaptation_doc = root / "docs" / "standards" / "bootstrap-adaptation.md"
        if adaptation_doc.exists():
            actions.append(
                AdoptionAction(
                    kind="skip",
                    path="docs/standards/bootstrap-adaptation.md",
                    reason="bootstrap adaptation doc already exists in the target repo",
                    managed=True,
                )
            )
        else:
            actions.append(
                AdoptionAction(
                    kind="create",
                    path="docs/standards/bootstrap-adaptation.md",
                    reason="target repo is missing the bootstrap adaptation doc",
                    managed=True,
                )
            )
        return actions

    def _plan_docs(self, root: Path, inspection: AdoptionInspection) -> list[AdoptionAction]:
        actions: list[AdoptionAction] = []
        for rel in ["docs/map/README.md", "docs/arc/README.md", "docs/arc/SPECS/README.md"]:
            target = root / rel
            if target.exists():
                actions.append(
                    AdoptionAction(
                        kind="skip",
                        path=rel,
                        reason="current-state or goal-state doc already exists",
                        managed=True,
                    )
                )
            else:
                actions.append(
                    AdoptionAction(
                        kind="create",
                        path=rel,
                        reason="required scaffold doc is missing from the target repo",
                        managed=True,
                    )
                )
        return actions

    def _plan_skills(self, root: Path, inspection: AdoptionInspection) -> list[AdoptionAction]:
        actions: list[AdoptionAction] = []
        manifest = root / ".agents" / "skills-sync.manifest.json"
        if not manifest.exists():
            actions.append(
                AdoptionAction(
                    kind="create",
                    path=".agents/skills-sync.manifest.json",
                    reason="target repo is missing the skill manifest baseline",
                    managed=True,
                )
            )

        actions.append(
            AdoptionAction(
                kind="reconcile-skills",
                path=".agents/skills-sync.manifest.json",
                reason="skill manifest needs explicit classification against the selected universal source/profile",
                managed=True,
                notes=["distinguish source drift, stale manifest entries, and intentional local extras"],
            )
        )

        skills_seed = root / ".agents" / "source" / "universal-skills"
        if skills_seed.exists():
            actions.append(
                AdoptionAction(
                    kind="skip",
                    path=".agents/source/universal-skills",
                    reason="repo-local universal-skills seed already exists",
                    managed=True,
                )
            )
        else:
            actions.append(
                AdoptionAction(
                    kind="create",
                    path=".agents/source/universal-skills",
                    reason="repo-local universal-skills seed is missing",
                    managed=True,
                )
            )

        return actions

    def _legacy_agents_layout_detected(self, agents_config: Path) -> bool:
        if not agents_config.exists():
            return False
        text = agents_config.read_text(encoding="utf-8")
        legacy_markers = (
            "templates_dir: .agents/a-docs/templates",
            "arc_dir: .agents/arc",
            "map_dir: .agents/arc/map",
            "skills_sync:\n  source_dir: \"../universal-skills\"",
            "skills_sync:\n  source_dir: ../universal-skills",
        )
        return any(marker in text for marker in legacy_markers)

    def _summarize_plan(self, actions: list[AdoptionAction], inspection: AdoptionInspection) -> str:
        if any(action.kind == "conflict" for action in actions):
            return "Update plan contains conflicts that require operator review before overwrite."
        if inspection.has_runtime_wrapper and inspection.has_mcp_wrapper and inspection.justfile_uses_direct_import:
            return "Target repo is mostly aligned; only overlays, reconciliation, and benchmark capture remain."
        return "Target repo needs an overlay update with explicit compatibility adapters and runtime validation."
