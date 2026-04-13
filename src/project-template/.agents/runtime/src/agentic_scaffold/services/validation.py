from __future__ import annotations

from agentic_scaffold.config import RuntimeConfig
from agentic_scaffold.models import ValidationIssue, ValidationReport


class StructureValidator:
    def __init__(self, config: RuntimeConfig) -> None:
        self.config = config

    def validate(self, auto_fix: bool = False) -> ValidationReport:
        issues: list[ValidationIssue] = []
        created_dirs: list[str] = []
        root = self.config.repo_root

        for relative in self.config.required_folders:
            target = root / relative
            if target.exists():
                if not target.is_dir():
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            code="folder-not-dir",
                            path=relative,
                            message="The path exists, but it is not a directory.",
                        )
                    )
                continue
            if auto_fix:
                target.mkdir(parents=True, exist_ok=True)
                gitkeep = target / ".gitkeep"
                gitkeep.write_text("", encoding="utf-8")
                created_dirs.append(relative)
            else:
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing-folder",
                        path=relative,
                        message="Required directory is missing.",
                    )
                )

        templates_dir = root / "docs" / "templates"
        for template in self.config.required_templates:
            target = templates_dir / template
            if not target.exists():
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing-template",
                        path=target.relative_to(root).as_posix(),
                        message="Required template is missing.",
                    )
                )

        for runtime_doc in self.config.runtime_docs:
            target = root / runtime_doc
            if not target.exists():
                issues.append(
                    ValidationIssue(
                        severity="warning",
                        code="missing-runtime-doc",
                        path=runtime_doc,
                        message="Runtime document is missing.",
                    )
                )

        ok = not any(issue.severity == "error" for issue in issues)
        return ValidationReport(ok=ok, created_dirs=created_dirs, issues=issues)
