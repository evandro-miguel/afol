#!/usr/bin/env python3
"""
Tests for verify-tasks.py strict mode.

Covers:
- Evidence detection
- Report contradiction detection
- Temporal consistency checks
- Strict mode pass/fail scenarios
"""

import unittest
import tempfile
import shutil
import sys
from pathlib import Path
from datetime import datetime, timedelta
import importlib.util

# Load the module under test dynamically
sys.path.insert(0, str((Path(__file__).parent.parent).resolve()))
spec = importlib.util.spec_from_file_location(
    "verify_tasks",
    Path(__file__).parent.parent / "verify-tasks.py"
)
verify_tasks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_tasks)


class TestEvidenceExtraction(unittest.TestCase):
    """Test evidence extraction from task content."""

    def test_command_evidence(self):
        """Detect command/code blocks as evidence."""
        content = """
        Some text here.

        ```bash
        python3 -m unittest discover
        ```

        More text.
        """
        evidence = verify_tasks.extract_evidence(content, Path("test.md"))
        self.assertTrue(evidence['has_command'])
        self.assertGreater(evidence['evidence_count'], 0)

    def test_result_evidence(self):
        """Detect result/output mentions as evidence."""
        content = """
        The execution completed.

        Result: All tests passed.
        Status: success
        """
        evidence = verify_tasks.extract_evidence(content, Path("test.md"))
        self.assertTrue(evidence['has_result'])

    def test_artifact_evidence(self):
        """Detect artifact file references as evidence."""
        content = """
        Generated artifacts:

        artifact: test_results.json
        file: output.log
        evidence: proof.md
        """
        evidence = verify_tasks.extract_evidence(content, Path("test.md"))
        self.assertTrue(evidence['has_artifact'])

    def test_verification_evidence(self):
        """Detect verification statements as evidence."""
        content = """
        The implementation was verified and validated.

        Tests passed successfully.
        """
        evidence = verify_tasks.extract_evidence(content, Path("test.md"))
        self.assertTrue(evidence['has_verification'])

    def test_sufficient_evidence(self):
        """Test evidence sufficiency threshold (2 of 4 criteria)."""
        # Only 1 criterion - should fail (just mentions result without verification word)
        content_weak = "Result: see attached"
        evidence_weak = verify_tasks.extract_evidence(content_weak, Path("test.md"))
        self.assertFalse(verify_tasks.has_sufficient_evidence(evidence_weak))

        # 2 criteria - should pass
        content_strong = """
        ```bash
        python3 test.py
        ```

        Result: All tests passed.
        """
        evidence_strong = verify_tasks.extract_evidence(content_strong, Path("test.md"))
        self.assertTrue(verify_tasks.has_sufficient_evidence(evidence_strong))

    def test_no_evidence(self):
        """Test content with no evidence."""
        content = "Just some plain text without any evidence markers."
        evidence = verify_tasks.extract_evidence(content, Path("test.md"))
        self.assertFalse(evidence['has_command'])
        self.assertFalse(evidence['has_result'])
        self.assertFalse(evidence['has_artifact'])
        self.assertFalse(evidence['has_verification'])
        self.assertEqual(evidence['evidence_count'], 0)


class TestReportContradictions(unittest.TestCase):
    """Test report contradiction detection."""

    def test_all_completed_with_pending(self):
        """Detect contradiction: all completed + pending work."""
        content = """
        # Summary
        All tasks completed successfully!

        # Notes
        Some features are still pending implementation.
        """
        contradictions = verify_tasks.detect_report_contradictions(content)
        self.assertTrue(len(contradictions) > 0)
        self.assertEqual(contradictions[0]['type'], 'completion_conflict')

    def test_all_completed_with_blocked(self):
        """Detect contradiction: all completed + blocked items."""
        content = """
        # Report
        All tasks are done!

        # Issues
        We are blocked by external API limitations.
        """
        contradictions = verify_tasks.detect_report_contradictions(content)
        self.assertTrue(len(contradictions) > 0)

    def test_all_completed_with_in_progress(self):
        """Detect warning: all completed + work in progress."""
        content = """
        # Summary
        All tasks completed!

        # Current Work
        Currently implementing additional features.
        """
        contradictions = verify_tasks.detect_report_contradictions(content)
        # This should be a warning, not error
        self.assertTrue(len(contradictions) > 0)

    def test_no_contradiction(self):
        """Test content without contradictions."""
        content = """
        # Summary
        Implementation completed.
        Testing verified all functionality.
        """
        contradictions = verify_tasks.detect_report_contradictions(content)
        self.assertEqual(len(contradictions), 0)

    def test_pending_only_no_contradiction(self):
        """Test content mentioning only pending work (no contradiction)."""
        content = """
        # Status
        Some items are pending review.
        Awaiting feedback on implementation.
        """
        contradictions = verify_tasks.detect_report_contradictions(content)
        self.assertEqual(len(contradictions), 0)


class TestTemporalConsistency(unittest.TestCase):
    """Test temporal consistency checks."""

    def setUp(self):
        """Create temporary session folder."""
        self.temp_dir = tempfile.mkdtemp()
        self.session_dir = Path(self.temp_dir)

    def tearDown(self):
        """Clean up temporary folder."""
        shutil.rmtree(self.temp_dir)

    def test_updated_at_before_created_at(self):
        """Detect error: updated_at before created_at."""
        content = """---
created_at: '2026-02-24T15:00:00-03:00'
updated_at: '2026-02-24T14:00:00-03:00'
status: active
---

# Test Document

Some content here.
"""
        doc_file = self.session_dir / "test_task_01.md"
        doc_file.write_text(content)

        issues = verify_tasks.check_temporal_consistency(self.session_dir)
        temporal_errors = [i for i in issues if i.get('severity') == 'error']
        self.assertTrue(len(temporal_errors) > 0)

    def test_timeline_later_than_updated_at(self):
        """Detect error: timeline entry later than updated_at."""
        now = datetime.now()
        future = now + timedelta(hours=2)
        past = now - timedelta(hours=2)

        content = f"""---
created_at: '{past.strftime("%Y-%m-%dT%H:%M:%S-03:00")}'
updated_at: '{past.strftime("%Y-%m-%dT%H:%M:%S-03:00")}'
status: active
---

# Log

## Timeline
- {future.strftime("%Y-%m-%d %H:%M")}-03 - Future event that hasn't happened
"""
        doc_file = self.session_dir / "test_log_01.md"
        doc_file.write_text(content)

        issues = verify_tasks.check_temporal_consistency(self.session_dir)
        temporal_errors = [i for i in issues if i.get('severity') == 'error']
        self.assertTrue(len(temporal_errors) > 0)

    def test_consistent_timestamps(self):
        """Test documents with consistent timestamps."""
        now = datetime.now()
        earlier = now - timedelta(hours=1)

        content = f"""---
created_at: '{earlier.strftime("%Y-%m-%dT%H:%M:%S-03:00")}'
updated_at: '{now.strftime("%Y-%m-%dT%H:%M:%S-03:00")}'
status: active
---

# Test Document

Some content.
"""
        doc_file = self.session_dir / "test_task_01.md"
        doc_file.write_text(content)

        issues = verify_tasks.check_temporal_consistency(self.session_dir)
        temporal_errors = [i for i in issues if i.get('severity') == 'error']
        self.assertEqual(len(temporal_errors), 0)

    def test_future_frontmatter_timestamp_fails(self):
        """Detect error when created_at/updated_at are in the future."""
        future = datetime.now() + timedelta(hours=3)
        content = f"""---
created_at: '{future.strftime("%Y-%m-%dT%H:%M:%S-03:00")}'
updated_at: '{future.strftime("%Y-%m-%dT%H:%M:%S-03:00")}'
status: active
---

# Future Document
"""
        doc_file = self.session_dir / "test_report_01.md"
        doc_file.write_text(content)

        issues = verify_tasks.check_temporal_consistency(self.session_dir)
        temporal_errors = [i for i in issues if i.get('severity') == 'error']
        self.assertTrue(any("is in the future" in i.get("description", "") for i in temporal_errors))


class TestStrictVerification(unittest.TestCase):
    """Test strict mode verification end-to-end."""

    def setUp(self):
        """Create temporary session folder."""
        self.temp_dir = tempfile.mkdtemp()
        self.session_dir = Path(self.temp_dir)
        self.original_root_dir = verify_tasks.ROOT_DIR
        self.original_roadmap_file = verify_tasks.ROADMAP_FILE
        self.original_specs_dir = verify_tasks.SPECS_DIR
        self._install_governance_context()

    def tearDown(self):
        """Clean up temporary folder."""
        verify_tasks.ROOT_DIR = self.original_root_dir
        verify_tasks.ROADMAP_FILE = self.original_roadmap_file
        verify_tasks.SPECS_DIR = self.original_specs_dir
        shutil.rmtree(self.temp_dir)

    def _install_governance_context(self):
        """Create a minimal roadmap/spec context for strict governance checks."""
        arc_dir = self.session_dir / ".agents" / "arc"
        specs_dir = arc_dir / "SPECS"
        specs_dir.mkdir(parents=True)

        roadmap_file = arc_dir / "GENERAL-ROADMAP.md"
        roadmap_file.write_text(
            "# General Roadmap\n\n"
            "### F-01 Governance-Aware Feature\n"
            "- Governing spec: `.agents/arc/SPECS/test-parent-spec_01.md`\n"
        )
        (specs_dir / "test-parent-spec_01.md").write_text(
            "---\n"
            "doc_type: spec\n"
            "id: test-parent-spec_01\n"
            "---\n\n"
            "# Parent Spec\n"
        )
        (specs_dir / "test-child-spec_01.md").write_text(
            "---\n"
            "doc_type: spec\n"
            "id: test-child-spec_01\n"
            "---\n\n"
            "# Child Spec\n"
        )

        verify_tasks.ROOT_DIR = self.session_dir
        verify_tasks.ROADMAP_FILE = roadmap_file
        verify_tasks.SPECS_DIR = specs_dir

    def _governance_fields(self, *, feature_id: str = "F-01", child_spec: str = "") -> str:
        return (
            f"roadmap_feature: {feature_id}\n"
            "parent_spec: test-parent-spec_01\n"
            f'child_spec: "{child_spec}"\n'
        )

    def _write_standard_docs(
        self,
        *,
        task_body: str,
        report_body: str = "Implementation completed and verified.\n",
        feature_id: str = "F-01",
        child_spec: str = "",
        plan_status: str = "active",
        plan_body: str | None = None,
    ) -> None:
        governance = self._governance_fields(feature_id=feature_id, child_spec=child_spec)
        default_plan_body = (
            "# Plan\n\n"
            "## Purpose / Big Picture\n"
            "Explain the user-visible outcome.\n\n"
            "## Progress\n"
            "- [x] 2026-03-23 18:00Z - Baseline planning completed.\n\n"
            "## Surprises & Discoveries\n"
            "- Observation: none yet.\n"
            "  Evidence: n/a\n\n"
            "## Decision Log\n"
            "- Decision: keep the workbench plan canonical.\n"
            "  Rationale: matches the scaffold workflow.\n"
            "  Date/Author: 2026-03-23 / test\n\n"
            "## Outcomes & Retrospective\n"
            "- Outcome: baseline prepared.\n"
            "- Remaining: implementation.\n"
            "- Lesson: keep the plan current.\n\n"
            "## Context and Orientation\n"
            "Current repo state and key files.\n\n"
            "## Plan of Work\n"
            "Describe the sequence of changes.\n\n"
            "## Concrete Steps\n"
            "1. Edit the template.\n"
            "2. Run verification.\n\n"
            "## Validation and Acceptance\n"
            "- Run pytest and expect success.\n\n"
            "## Idempotence and Recovery\n"
            "Safe to rerun validation.\n\n"
            "## Artifacts and Notes\n"
            "- None.\n\n"
            "## Interfaces and Dependencies\n"
            "- verify-tasks.py\n"
        )
        plan_content = (
            "---\n"
            "doc_type: plan\n"
            "id: test_plan_01\n"
            f"status: {plan_status}\n"
            f"{governance}"
            "links:\n"
            "  brainstorm: test_brainstorm_01\n"
            "  explorer_check: test_explorer_check_01\n"
            "  task: test_task_01\n"
            "---\n\n"
            f"{plan_body or default_plan_body}"
        )
        task_content = (
            "---\n"
            "doc_type: task\n"
            "id: test_task_01\n"
            "status: active\n"
            f"{governance}"
            "depends_on:\n"
            "  - test_plan_01\n"
            "links:\n"
            "  plan: test_plan_01\n"
            "---\n\n"
            f"{task_body}"
        )
        report_content = (
            "---\n"
            "doc_type: report\n"
            "id: test_report_01\n"
            "status: active\n"
            f"{governance}"
            "links:\n"
            "  plan: test_plan_01\n"
            "  task: test_task_01\n"
            "---\n\n"
            "# Report\n"
            f"{report_body}"
        )
        log_content = (
            "---\n"
            "doc_type: log\n"
            "id: test_log_01\n"
            "status: active\n"
            f"{governance}"
            "links:\n"
            "  plan: test_plan_01\n"
            "  task: test_task_01\n"
            "---\n\n"
            "# Log\n"
        )
        brainstorm_content = (
            "---\n"
            "doc_type: brainstorm\n"
            "id: test_brainstorm_01\n"
            "status: final\n"
            f"{governance}"
            "---\n\n"
            "# Brainstorm\n"
        )
        explorer_content = (
            "---\n"
            "doc_type: explorer-check\n"
            "id: test_explorer_check_01\n"
            "status: final\n"
            f"{governance}"
            "---\n\n"
            "# Explorer Check\n"
        )

        (self.session_dir / "test_plan_01.md").write_text(plan_content)
        (self.session_dir / "test_task_01.md").write_text(task_content)
        (self.session_dir / "test_report_01.md").write_text(report_content)
        (self.session_dir / "test_log_01.md").write_text(log_content)
        (self.session_dir / "test_brainstorm_01.md").write_text(brainstorm_content)
        (self.session_dir / "test_explorer_check_01.md").write_text(explorer_content)

    def test_strict_mode_passes_with_evidence(self):
        """Strict mode passes when tasks have evidence."""
        self._write_standard_docs(
            task_body=(
                "# Tasks\n\n"
                "## State Board\n\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | done | worker | Implement feature with evidence |\n\n"
                "## Execution\n\n"
                "```bash\n"
                "python3 -m unittest\n"
                "```\n\n"
                "Result: All tests passed successfully.\n"
            )
        )

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertTrue(all_completed)
        self.assertEqual(len(results['evidence_issues']), 0)
        self.assertEqual(len(results['contradictions']), 0)
        self.assertEqual(len(results['governance_issues']), 0)

    def test_strict_mode_fails_without_evidence(self):
        """Strict mode fails when completed tasks lack evidence."""
        self._write_standard_docs(
            task_body=(
                "# Tasks\n\n"
                "## State Board\n\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | done | worker | Implement feature |\n"
            )
        )

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertFalse(all_completed)
        self.assertGreater(len(results['evidence_issues']), 0)
        self.assertEqual(len(results['governance_issues']), 0)

    def test_strict_mode_fails_with_contradictions(self):
        """Strict mode fails when report has contradictions."""
        self._write_standard_docs(
            task_body=(
                "# Tasks\n\n"
                "## State Board\n\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | done | worker | Implement feature |\n\n"
                "```bash\n"
                "python3 test.py\n"
                "```\n\n"
                "Result: Success.\n"
            ),
            report_body=(
                "All tasks completed!\n\n"
                "However, some items are still pending review.\n"
            ),
        )

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertFalse(all_completed)
        self.assertGreater(len(results['contradictions']), 0)
        self.assertEqual(len(results['governance_issues']), 0)

    def test_strict_mode_fails_when_final_plan_lacks_exploration_gates(self):
        governance = self._governance_fields()
        (self.session_dir / "test_plan_01.md").write_text(
            "---\n"
            "doc_type: plan\n"
            "id: test_plan_01\n"
            "status: final\n"
            f"{governance}"
            "links:\n"
            "  task: test_task_01\n"
            "---\n\n"
            "# Plan\n"
        )
        (self.session_dir / "test_task_01.md").write_text(
            "---\n"
            "doc_type: task\n"
            "id: test_task_01\n"
            "status: active\n"
            f"{governance}"
            "depends_on:\n"
            "  - test_plan_01\n"
            "links:\n"
            "  plan: test_plan_01\n"
            "---\n\n"
            "# Tasks\n\n"
            "## State Board\n\n"
            "| Task | State | Owner | Notes |\n"
            "|------|-------|-------|-------|\n"
            "| T-01 | done | worker | Covered |\n\n"
            "```bash\npytest\n```\n\n"
            "Result: passed.\n"
        )
        (self.session_dir / "test_report_01.md").write_text(
            "---\n"
            "doc_type: report\n"
            "id: test_report_01\n"
            "status: active\n"
            f"{governance}"
            "---\n\n"
            "# Report\n"
        )
        (self.session_dir / "test_log_01.md").write_text(
            "---\n"
            "doc_type: log\n"
            "id: test_log_01\n"
            "status: active\n"
            f"{governance}"
            "---\n\n"
            "# Log\n"
        )

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertFalse(all_completed)
        self.assertGreater(len(results["planning_gate_issues"]), 0)

    def test_strict_mode_fails_when_final_plan_lacks_execplan_sections(self):
        self._write_standard_docs(
            task_body=(
                "# Tasks\n\n"
                "## State Board\n\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | done | worker | Covered |\n\n"
                "```bash\npytest\n```\n\n"
                "Result: passed.\n"
            ),
            plan_status="final",
            plan_body="# Plan\n\n## Progress\n- [x] 2026-03-23 18:00Z - Only progress present.\n",
        )
        report_file = self.session_dir / "test_report_01.md"
        report_file.write_text(report_file.read_text().replace("status: active", "status: final", 1))
        postmortem_file = self.session_dir / "test_postmortem_01.md"
        postmortem_file.write_text(
            "---\n"
            "doc_type: postmortem\n"
            "id: test_postmortem_01\n"
            "status: final\n"
            "roadmap_feature: F-01\n"
            "parent_spec: test-parent-spec_01\n"
            "child_spec: \"\"\n"
            "---\n\n"
            "# Postmortem\n"
        )

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertFalse(all_completed)
        self.assertGreater(len(results["execplan_issues"]), 0)

    def test_strict_mode_fails_when_final_plan_progress_has_no_checkboxes(self):
        plan_body = (
            "# Plan\n\n"
            "## Purpose / Big Picture\nText.\n\n"
            "## Progress\nPlain text only.\n\n"
            "## Surprises & Discoveries\nNone.\n\n"
            "## Decision Log\nNone.\n\n"
            "## Outcomes & Retrospective\nNone.\n\n"
            "## Context and Orientation\nText.\n\n"
            "## Plan of Work\nText.\n\n"
            "## Concrete Steps\nText.\n\n"
            "## Validation and Acceptance\nText.\n\n"
            "## Idempotence and Recovery\nText.\n\n"
            "## Artifacts and Notes\nText.\n\n"
            "## Interfaces and Dependencies\nText.\n"
        )
        self._write_standard_docs(
            task_body=(
                "# Tasks\n\n"
                "## State Board\n\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | done | worker | Covered |\n\n"
                "```bash\npytest\n```\n\n"
                "Result: passed.\n"
            ),
            plan_status="final",
            plan_body=plan_body,
        )
        report_file = self.session_dir / "test_report_01.md"
        report_file.write_text(report_file.read_text().replace("status: active", "status: final", 1))
        postmortem_file = self.session_dir / "test_postmortem_01.md"
        postmortem_file.write_text(
            "---\n"
            "doc_type: postmortem\n"
            "id: test_postmortem_01\n"
            "status: final\n"
            "roadmap_feature: F-01\n"
            "parent_spec: test-parent-spec_01\n"
            "child_spec: \"\"\n"
            "---\n\n"
            "# Postmortem\n"
        )

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertFalse(all_completed)
        self.assertGreater(len(results["execplan_issues"]), 0)

    def test_strict_mode_fails_when_final_report_lacks_postmortem(self):
        self._write_standard_docs(
            task_body=(
                "# Tasks\n\n"
                "## State Board\n\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | done | worker | Implement feature with evidence |\n\n"
                "```bash\npytest\n```\n\n"
                "Result: passed.\n"
            ),
            report_body="Implementation completed and verified.\n",
        )
        report_file = self.session_dir / "test_report_01.md"
        report_text = report_file.read_text().replace("status: active", "status: final", 1)
        report_file.write_text(report_text)

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertFalse(all_completed)
        self.assertGreater(len(results["postmortem_issues"]), 0)

    def test_non_strict_mode_ignores_evidence(self):
        """Non-strict mode passes without evidence checks."""
        # Create task file WITHOUT evidence (State Board format)
        task_content = """---
doc_type: task
id: test_task_01
---

# Tasks

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Implement feature
"""
        task_file = self.session_dir / "test_task_01.md"
        task_file.write_text(task_content)

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=False)
        self.assertTrue(all_completed)
        # Evidence issues should not be populated in non-strict mode
        self.assertEqual(len(results.get('evidence_issues', [])), 0)

    def test_strict_mode_fails_on_plan_task_link_mismatch(self):
        """Strict mode fails when latest plan links task that does not reference the plan."""
        plan_content = """---
doc_type: plan
id: test_plan_02
status: active
roadmap_feature: F-01
parent_spec: test-parent-spec_01
child_spec: ""
links:
  task: test_task_01
---

# Plan
"""
        task_content = """---
doc_type: task
id: test_task_01
status: active
roadmap_feature: F-01
parent_spec: test-parent-spec_01
child_spec: ""
depends_on:
  - test_plan_01
links:
  plan: test_plan_01
---

# Tasks

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Implement

```bash
python3 test.py
```
Result: passed
"""
        report_content = """---
doc_type: report
id: test_report_01
status: active
roadmap_feature: F-01
parent_spec: test-parent-spec_01
child_spec: ""
links:
  plan: test_plan_02
  task: test_task_01
---

# Report
All done.
"""
        log_content = """---
doc_type: log
id: test_log_01
status: active
roadmap_feature: F-01
parent_spec: test-parent-spec_01
child_spec: ""
links:
  plan: test_plan_02
  task: test_task_01
---

# Log
"""
        (self.session_dir / "z_test_plan_02.md").write_text(plan_content)
        (self.session_dir / "z_test_task_01.md").write_text(task_content)
        (self.session_dir / "z_test_report_01.md").write_text(report_content)
        (self.session_dir / "z_test_log_01.md").write_text(log_content)

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertFalse(all_completed)
        self.assertGreater(len(results.get('coherence_issues', [])), 0)
        self.assertEqual(len(results.get('governance_issues', [])), 0)

    def test_strict_mode_fails_when_final_doc_has_open_checklist(self):
        """Strict mode fails when status=final doc still has open checklist markers."""
        task_content = """---
doc_type: task
id: test_task_01
status: active
roadmap_feature: F-01
parent_spec: test-parent-spec_01
child_spec: ""
links:
  plan: test_plan_01
depends_on:
  - test_plan_01
---

# Tasks

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Implement

```bash
python3 test.py
```
Result: passed
"""
        plan_content = """---
doc_type: plan
id: test_plan_01
status: active
roadmap_feature: F-01
parent_spec: test-parent-spec_01
child_spec: ""
links:
  task: test_task_01
---

# Plan
"""
        log_content = """---
doc_type: log
id: test_log_01
status: active
roadmap_feature: F-01
parent_spec: test-parent-spec_01
child_spec: ""
links:
  plan: test_plan_01
  task: test_task_01
---

# Log
"""
        final_standard = """---
doc_type: standard
id: test_policy_01
status: final
---

# Policy
- [ ] unresolved checklist item
"""
        (self.session_dir / "a_test_plan_01.md").write_text(plan_content)
        (self.session_dir / "a_test_task_01.md").write_text(task_content)
        (self.session_dir / "a_test_log_01.md").write_text(log_content)
        (self.session_dir / "a_test_policy_01.md").write_text(final_standard)

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertFalse(all_completed)
        self.assertGreater(len(results.get('final_doc_issues', [])), 0)

    def test_strict_mode_fails_on_governance_mismatch(self):
        """Strict mode fails when latest task/log/report do not match plan governance."""
        self._write_standard_docs(
            task_body=(
                "# Tasks\n\n"
                "## State Board\n\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | done | worker | Implement feature |\n\n"
                "```bash\n"
                "python3 test.py\n"
                "```\n"
                "Result: passed\n"
            ),
            child_spec="test-child-spec_01",
        )

        task_path = self.session_dir / "test_task_01.md"
        task_path.write_text(
            task_path.read_text().replace("roadmap_feature: F-01", "roadmap_feature: F-02", 1)
        )

        all_completed, results = verify_tasks.verify_session(self.session_dir, strict=True)
        self.assertFalse(all_completed)
        self.assertGreater(len(results.get("governance_issues", [])), 0)


if __name__ == '__main__':
    unittest.main()
