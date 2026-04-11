import importlib.util
import unittest
from pathlib import Path
from unittest import mock


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCRIPT_PATH = Path(".agents/scripts/agents-status.py").resolve()


class StatusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.status = load_module("agents_status_tests", SCRIPT_PATH)

    def test_parse_args_returns_session_when_provided(self):
        """parse_args must return session when --session is provided."""
        with mock.patch.object(
            self.status.argparse.ArgumentParser,
            "parse_args",
            return_value=mock.Mock(session="test-session", format="text"),
        ):
            args = self.status.parse_args()
            self.assertEqual(args.session, "test-session")

    def test_parse_args_supports_format_json(self):
        """parse_args must support --format json."""
        with mock.patch.object(
            self.status.argparse.ArgumentParser,
            "parse_args",
            return_value=mock.Mock(session=None, format="json"),
        ):
            args = self.status.parse_args()
            self.assertEqual(args.format, "json")

    def test_parse_args_supports_format_text(self):
        """parse_args must support --format text."""
        with mock.patch.object(
            self.status.argparse.ArgumentParser,
            "parse_args",
            return_value=mock.Mock(session=None, format="text"),
        ):
            args = self.status.parse_args()
            self.assertEqual(args.format, "text")

    def test_main_returns_int_exit_code(self):
        """main must return an integer exit code."""
        mock_args = mock.Mock(session=None, format="text", artifact=[])
        with mock.patch.object(self.status, "parse_args", return_value=mock_args):
            with mock.patch.object(
                self.status, "summarize_session", return_value={"context_ready": True}
            ):
                result = self.status.main()
                self.assertIsInstance(result, int)
