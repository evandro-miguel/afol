import importlib.util
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AgentsNewQuickModeTests(unittest.TestCase):
    def test_main_does_not_create_session_folder_twice(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_main_flow_test", script_path)

        args = {
            "theme": "execution-integrity-hardening",
            "use_spec": False,
            "use_spec_lite": True,
            "plan_only": False,
            "force_new": True,
            "quick_mode": False,
            "intent": "delivery",
            "feature_id": "F-01",
            "parent_spec": "260306_roadmap-first-delivery-system_spec_01",
            "child_spec": "",
            "with_artifacts": [],
        }

        with (
            mock.patch.object(agents_new, "_parse_args", return_value=args),
            mock.patch.object(agents_new, "get_active_session", return_value="260224_1030_scripts-lean-efficiency"),
            mock.patch.object(agents_new, "_handle_quick_mode", return_value=False),
            mock.patch.object(agents_new, "_validate_governance_requirements"),
            mock.patch.object(agents_new, "_check_active_session_policy"),
            mock.patch.object(agents_new, "get_session_id", return_value="260224_1300_execution-integrity-hardening"),
            mock.patch.object(agents_new, "get_timestamp", return_value="2026-02-24T13:00:00-03:00"),
            mock.patch.object(agents_new, "_create_workstream") as create_workstream_mock,
            mock.patch.object(agents_new, "create_session_folder") as create_session_folder_mock,
        ):
            agents_new.main()

        create_workstream_mock.assert_called_once_with(
            "260224_1300_execution-integrity-hardening",
            "execution-integrity-hardening",
            "2026-02-24T13:00:00-03:00",
            args,
        )
        create_session_folder_mock.assert_not_called()

    def test_telemetry_pattern_helpers_are_non_blocking(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_helpers_test", script_path)

        # Helpers should never break main flow when optional scripts are unavailable.
        agents_new.TELEMETRY_SCRIPT = Path("/tmp/does-not-exist-telemetry.py")
        agents_new.PATTERNS_SCRIPT = Path("/tmp/does-not-exist-patterns.py")

        agents_new.record_session_start("sid", "theme", False)
        agents_new.suggest_patterns_for_theme("theme")

    def test_validate_governance_requirements_normalizes_parent_and_child_specs(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_governance_test", script_path)

        args = {
            "quick_mode": False,
            "feature_id": "F-07",
            "parent_spec": "parent-raw",
            "child_spec": "child-raw",
        }

        with tempfile.TemporaryDirectory() as td:
            roadmap_file = Path(td) / "GENERAL-ROADMAP.md"
            roadmap_file.write_text("### F-07 Governance Fixture\n")
            with (
                mock.patch.object(agents_new, "GOVERNANCE_REQUIRED", True),
                mock.patch.object(agents_new, "QUICK_MODE_BYPASSES_GOVERNANCE", True),
                mock.patch.object(agents_new, "ROADMAP_FILE", roadmap_file),
                mock.patch.object(agents_new, "_roadmap_has_feature", return_value=True),
                mock.patch.object(agents_new, "_normalize_spec_reference", side_effect=["parent-spec", "child-spec"]),
            ):
                agents_new._validate_governance_requirements(args)

        self.assertEqual(args["feature_id"], "F-07")
        self.assertEqual(args["parent_spec"], "parent-spec")
        self.assertEqual(args["child_spec"], "child-spec")

    def test_validate_governance_requirements_skips_standard_checks_in_quick_mode(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_governance_quick_test", script_path)

        args = {
            "quick_mode": True,
            "feature_id": "",
            "parent_spec": "",
            "child_spec": "",
        }

        with mock.patch.object(agents_new, "QUICK_MODE_BYPASSES_GOVERNANCE", True):
            agents_new._validate_governance_requirements(args)

    def test_get_timestamp_uses_configured_offset(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_timestamp_test", script_path)

        with mock.patch.object(
            agents_new,
            "now_iso_with_offset",
            return_value="2026-02-24T13:00:00-03:00",
        ) as mocked:
            self.assertEqual(agents_new.get_timestamp(), "2026-02-24T13:00:00-03:00")
            mocked.assert_called_once_with(agents_new.WB_OFFSET)

    def test_get_session_id_uses_compact_session_timestamp_helper(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_session_id_test", script_path)

        with mock.patch.object(
            agents_new,
            "now_compact_for_session",
            return_value="260624_1205",
        ) as mocked:
            self.assertEqual(
                agents_new.get_session_id("my execution test"),
                "260624_1205_my-execution-test",
            )
            mocked.assert_called_once_with(agents_new.WB_OFFSET)

    def test_add_quick_task_updates_task_and_materializes_log_when_needed(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            session_id = "260223_1200_sample-theme"
            session_dir = wb_dir / session_id
            session_dir.mkdir(parents=True)

            task_file = session_dir / f"{session_id}_task_01.md"

            task_file.write_text(
                "---\n"
                "doc_type: task\n"
                "theme: sample-theme\n"
                "roadmap_feature: F-08\n"
                "parent_spec: 260306_context-driven-execution-commands_spec_01\n"
                "workstream_intent: delivery\n"
                "---\n\n"
                "# Tasks\n\n"
                "## Task List\n"
                "- [ ] T-01 existing task\n"
            )

            agents_new.ROOT_DIR = root
            agents_new.WB_DIR = wb_dir

            task_id, task_path, log_path = agents_new.add_quick_task_to_active_session(
                active_session=session_id,
                theme="quick-fix",
                timestamp="2026-02-23T12:34:56-03:00",
            )

            self.assertEqual(task_id, "T-02")
            self.assertEqual(task_path, task_file)
            self.assertTrue(log_path.exists())

            task_content = task_file.read_text()
            self.assertIn("- [ ] T-02 quick-fix", task_content)

            log_content = log_path.read_text()
            self.assertIn("doc_type: log", log_content)
            self.assertIn(
                "- 2026-02-23T12:34:56-03:00 - Added quick task T-02: quick-fix - pending",
                log_content,
            )

    def test_template_replacements_include_exploration_and_postmortem_docs(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_template_replacements_test", script_path)

        replacements = agents_new._build_template_replacements(
            "260306_2002_execution-intelligence-system",
            {
                "feature_id": "F-07",
                "parent_spec": "parent",
                "child_spec": "",
                "pack": "api-cleanup",
                "intent": "research",
            },
        )

        self.assertEqual(
            replacements["<brainstorm_doc_id>"],
            "260306_2002_execution-intelligence-system-api-cleanup_brainstorm_01",
        )
        self.assertEqual(
            replacements["<explorer_check_doc_id>"],
            "260306_2002_execution-intelligence-system-api-cleanup_explorer-check_01",
        )
        self.assertEqual(
            replacements["<postmortem_doc_id>"],
            "260306_2002_execution-intelligence-system-api-cleanup_postmortem_01",
        )
        self.assertEqual(
            replacements["<report_doc_id_or_empty>"],
            "260306_2002_execution-intelligence-system-api-cleanup_report_01",
        )
        self.assertEqual(replacements["<workstream_intent>"], "research")

    def test_iter_workstream_artifacts_uses_intent_policy(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_manifest_test", script_path)

        planning_default = agents_new._iter_workstream_artifacts(
            {
                "intent": "planning",
                "plan_only": False,
                "use_spec": False,
                "use_spec_lite": False,
                "with_artifacts": [],
            }
        )
        self.assertEqual(
            [entry["doc_type"] for entry in planning_default],
            ["plan", "task"],
        )

        planning_plan_only = agents_new._iter_workstream_artifacts(
            {
                "intent": "planning",
                "plan_only": True,
                "use_spec": False,
                "use_spec_lite": False,
                "with_artifacts": [],
            }
        )
        self.assertEqual([entry["doc_type"] for entry in planning_plan_only], ["plan"])

        planning_only = agents_new._iter_workstream_artifacts(
            {
                "intent": "delivery",
                "plan_only": True,
                "use_spec": False,
                "use_spec_lite": False,
                "with_artifacts": [],
            }
        )
        self.assertEqual([entry["doc_type"] for entry in planning_only], ["plan"])

        delivery_with_spec = agents_new._iter_workstream_artifacts(
            {
                "intent": "delivery",
                "plan_only": False,
                "use_spec": True,
                "use_spec_lite": False,
                "with_artifacts": [],
            }
        )
        self.assertEqual(
            [entry["doc_type"] for entry in delivery_with_spec],
            ["plan", "task", "spec"],
        )

        research_only = agents_new._iter_workstream_artifacts(
            {
                "intent": "research",
                "plan_only": False,
                "use_spec": False,
                "use_spec_lite": False,
                "with_artifacts": [],
            }
        )
        self.assertEqual([entry["doc_type"] for entry in research_only], ["research"])

        research_with_log = agents_new._iter_workstream_artifacts(
            {
                "intent": "research",
                "plan_only": False,
                "use_spec": False,
                "use_spec_lite": False,
                "with_artifacts": ["log"],
            }
        )
        self.assertEqual(
            [entry["doc_type"] for entry in research_with_log],
            ["research", "log"],
        )

    def test_parse_args_infers_research_intent_from_theme_when_not_explicit(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_intent_inference_test", script_path)

        argv = ["agents-new.py", "auth-investigation"]
        with mock.patch.object(sys, "argv", argv):
            parsed = agents_new._parse_args()

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["intent"], "research")

    def test_parse_args_keeps_spec_lite_legacy_and_accepts_spec_test(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_spec_alias_parse_test", script_path)

        argv = ["agents-new.py", "workflow-hardening", "--spec-lite", "--spec-test", "--with", "spec_lite"]
        with mock.patch.object(sys, "argv", argv):
            parsed = agents_new._parse_args()

        self.assertIsNotNone(parsed)
        self.assertFalse(parsed["use_spec_child"])
        self.assertTrue(parsed["use_spec_lite"])
        self.assertTrue(parsed["use_spec_test"])
        self.assertIn("spec-lite", parsed["with_artifacts"])

    def test_ordered_selected_doc_types_rejects_disallowed_artifacts_for_intent(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_policy_validation_test", script_path)

        with self.assertRaises(ValueError):
            agents_new._ordered_selected_doc_types(
                {
                    "intent": "research",
                    "plan_only": False,
                    "use_spec": False,
                    "use_spec_child": False,
                    "use_spec_lite": False,
                    "use_spec_test": False,
                    "with_artifacts": ["task"],
                }
            )

    def test_ordered_selected_doc_types_keeps_spec_lite_legacy_artifact(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_spec_alias_selection_test", script_path)

        selected = agents_new._ordered_selected_doc_types(
            {
                "intent": "delivery",
                "plan_only": False,
                "use_spec": False,
                "use_spec_child": False,
                "use_spec_lite": False,
                "use_spec_test": False,
                "with_artifacts": ["spec-lite"],
            }
        )
        self.assertIn("spec-lite", selected)
        self.assertNotIn("spec-child", selected)

    def test_ordered_selected_doc_types_selects_spec_child_and_spec_test(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_spec_child_selection_test", script_path)

        selected = agents_new._ordered_selected_doc_types(
            {
                "intent": "delivery",
                "plan_only": False,
                "use_spec": False,
                "use_spec_child": True,
                "use_spec_lite": False,
                "use_spec_test": True,
                "with_artifacts": [],
            }
        )
        self.assertIn("spec-child", selected)
        self.assertIn("spec-test", selected)
        self.assertNotIn("spec-lite", selected)

    def test_coerce_artifact_manifest_fallbacks_to_default(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_manifest_fallback_test", script_path)

        fallback = agents_new._coerce_artifact_manifest({})
        self.assertEqual(
            [entry["doc_type"] for entry in fallback],
            [
                "brainstorm",
                "research",
                "explorer-check",
                "plan",
                "task",
                "spec",
                "spec-child",
                "spec-test",
                "spec-lite",
                "log",
                "report",
                "postmortem",
            ],
        )

    def test_coerce_artifact_manifest_uses_only_valid_entries(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_manifest_valid_entries_test", script_path)

        manifest = agents_new._coerce_artifact_manifest(
            {
                "artifacts": [
                    {
                        "doc_type": "plan",
                        "template": "plan.md",
                        "phase": "planning",
                        "depends_on": ["brainstorm"],
                    },
                    {"doc_type": "", "template": "task.md", "phase": "delivery"},
                    {"doc_type": "report", "template": "report.md", "phase": "delivery"},
                ]
            }
        )

        self.assertEqual([entry["doc_type"] for entry in manifest], ["plan", "report"])
        self.assertEqual(manifest[0]["template"], "plan.md")
        self.assertEqual(manifest[1]["template"], "report.md")
        self.assertEqual(manifest[0]["depends_on"], ["brainstorm"])


if __name__ == "__main__":
    unittest.main()
