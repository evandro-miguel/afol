import importlib.util
import json
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

            saved = [json.loads(line) for line in events_file.read_text().splitlines() if line.strip()]
            self.assertEqual(len(saved), 1)
            self.assertEqual(saved[0]["context"], {"source": "test"})
            self.assertNotIn("context", saved[0]["metadata"])

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

            saved = [json.loads(line) for line in events_file.read_text().splitlines() if line.strip()]
            self.assertEqual(len(saved), 1)
            self.assertEqual(saved[0]["context"], {"via": "flag"})
            self.assertNotIn("context", saved[0]["metadata"])


if __name__ == "__main__":
    unittest.main()
