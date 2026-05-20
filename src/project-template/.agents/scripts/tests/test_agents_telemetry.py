import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from io import StringIO
from pathlib import Path
from unittest.mock import patch


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AgentsTelemetryTests(unittest.TestCase):
    def test_record_event_writes_context_as_top_level_field(self):
        script_path = Path(".agents/scripts/agents-telemetry.py").resolve()
        agents_telemetry = load_module("agents_telemetry_test_record", script_path)

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            events_file = root / "events.jsonl"

            agents_telemetry.TELEMETRY_EVENTS_FILE = events_file
            agents_telemetry.ACTIVE_SESSION_FILE = root / ".active_session"

            event = agents_telemetry.record_event(
                event_type="tool_exec",
                session_id="test-session",
                metadata={"tool_name": "unit-test"},
                context={"source": "test"},
            )

            self.assertEqual(event["context"], {"source": "test"})
            self.assertNotIn("context", event["metadata"])

            saved = [
                json.loads(line) for line in events_file.read_text().splitlines() if line.strip()
            ]
            self.assertEqual(len(saved), 1)
            self.assertEqual(saved[0]["context"], {"source": "test"})
            self.assertNotIn("context", saved[0]["metadata"])

    def test_record_event_falls_back_when_randomness_is_blocked(self):
        script_path = Path(".agents/scripts/agents-telemetry.py").resolve()
        agents_telemetry = load_module("agents_telemetry_test_randomness_fallback", script_path)

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            events_file = root / "events.jsonl"

            agents_telemetry.TELEMETRY_EVENTS_FILE = events_file
            agents_telemetry.ACTIVE_SESSION_FILE = root / ".active_session"

            with patch.object(
                agents_telemetry.uuid, "uuid4", side_effect=NotImplementedError("blocked")
            ):
                first = agents_telemetry.record_event("tool_exec", session_id="test-session")
                second = agents_telemetry.record_event("tool_exec", session_id="test-session")

            self.assertRegex(first["event_id"], r"^[0-9a-f]{64}$")
            self.assertRegex(second["event_id"], r"^[0-9a-f]{64}$")
            self.assertNotEqual(first["event_id"], second["event_id"])

    def test_main_record_parses_context_flag_into_context_field(self):
        script_path = Path(".agents/scripts/agents-telemetry.py").resolve()
        agents_telemetry = load_module("agents_telemetry_test_main", script_path)

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            events_file = root / "events.jsonl"

            agents_telemetry.TELEMETRY_EVENTS_FILE = events_file
            agents_telemetry.ACTIVE_SESSION_FILE = root / ".active_session"

            argv = [
                "agents-telemetry.py",
                "record",
                "tool_exec",
                "--session-id=test-session",
                '--metadata={"tool_name":"cli-test"}',
                '--context={"via":"flag"}',
            ]

            with patch.object(sys, "argv", argv), patch("sys.stdout", new=StringIO()):
                agents_telemetry.main()

            saved = [
                json.loads(line) for line in events_file.read_text().splitlines() if line.strip()
            ]
            self.assertEqual(len(saved), 1)
            self.assertEqual(saved[0]["context"], {"via": "flag"})
            self.assertNotIn("context", saved[0]["metadata"])

    def test_wrapper_records_failed_tool_exec_with_exit_code(self):
        wrapper_path = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            events_file = root / "events.jsonl"
            active_session_file = root / ".active_session"
            active_session_file.write_text("test-session\n")

            env = os.environ.copy()
            env["AGENTS_ACTIVE_SESSION_FILE"] = str(active_session_file)
            env["AGENTS_TELEMETRY_EVENTS_FILE"] = str(events_file)

            result = subprocess.run(
                [str(wrapper_path), "doctor", "--definitely-invalid-flag"],
                cwd=wrapper_path.parent.parent,
                env=env,
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(result.returncode, 0)
            saved = [
                json.loads(line) for line in events_file.read_text().splitlines() if line.strip()
            ]
            self.assertGreaterEqual(len(saved), 1)
            last_event = saved[-1]
            self.assertEqual(last_event["event_type"], "tool_exec")
            self.assertEqual(last_event["session_id"], "test-session")
            self.assertEqual(last_event["metadata"]["tool_name"], "doctor")
            self.assertEqual(last_event["metadata"]["outcome"], "failure")
            self.assertGreater(last_event["metadata"]["exit_code"], 0)

    def test_load_json_dict_rejects_non_object_json(self):
        script_path = Path(".agents/scripts/agents-telemetry.py").resolve()
        agents_telemetry = load_module("agents_telemetry_load_json_dict", script_path)

        with self.assertRaises(ValueError) as cm:
            agents_telemetry._load_json_dict("[1,2,3]")
        self.assertEqual(str(cm.exception), "JSON value must be an object")

        with self.assertRaises(ValueError) as cm:
            agents_telemetry._load_json_dict("{")
        self.assertIn("Invalid JSON value", str(cm.exception))

    def test_main_record_rejects_non_object_metadata_and_context_values(self):
        script_path = Path(".agents/scripts/agents-telemetry.py").resolve()
        agents_telemetry = load_module("agents_telemetry_record_guard", script_path)

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            events_file = root / "events.jsonl"

            agents_telemetry.TELEMETRY_EVENTS_FILE = events_file
            agents_telemetry.ACTIVE_SESSION_FILE = root / ".active_session"
            agents_telemetry.ACTIVE_SESSION_FILE.write_text("session-test\n", encoding="utf-8")

            argv = [
                "agents-telemetry.py",
                "record",
                "tool_exec",
                "--session-id=test-session",
                "--metadata=[]",
                '--context=["a"]',
            ]
            stderr = StringIO()
            with (
                patch.object(sys, "argv", argv),
                patch("sys.stderr", stderr),
                patch("sys.stdout", new=StringIO()),
            ):
                with self.assertRaises(SystemExit):
                    agents_telemetry.main()

            self.assertIn("JSON value must be an object", stderr.getvalue())
            self.assertFalse(events_file.exists())

    def test_get_iso_timestamp_delegates_to_config_timestamp_helper(self):
        script_path = Path(".agents/scripts/agents-telemetry.py").resolve()
        agents_telemetry = load_module("agents_telemetry_get_timestamp", script_path)

        with patch.object(
            agents_telemetry,
            "now_iso_with_offset",
            return_value="2026-01-01T00:00:00Z",
        ) as mocked:
            self.assertEqual(agents_telemetry.get_iso_timestamp(), "2026-01-01T00:00:00Z")
            mocked.assert_called_once_with("Z")


if __name__ == "__main__":
    unittest.main()
